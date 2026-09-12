import { sleep, FatalError, RetryableError } from "workflow";
import { prisma } from "@/lib/prisma";
import { wsSubmit, wsResult, WavespeedError } from "@/lib/identity/wavespeed";
import { submitKeyframeRequest } from "@/lib/identity/keyframe";
import { scoreIdentity } from "@/lib/identity/qa";
import { writeScript, writeVariants } from "@/lib/content/planner";
import { ClaudeError } from "@/lib/content/claude";
import { buildMotionPrompt, negativeFor } from "@/lib/personas/prompts";
import { RENDER, renderConfig, videoCents, keyframeCents } from "@/lib/render/models";
import { copyToBlob } from "@/lib/render/store";
import { logEvent } from "@/lib/scheduler/status";
import { PLATFORMS } from "@/lib/platforms";

const MAX_KEYFRAME_ATTEMPTS = 3;

/**
 * Idea -> script -> keyframe (+identity QA) -> captions -> video -> Blob.
 * Every step re-reads the Post row so retries and replays are idempotent.
 */
export async function renderPostWorkflow(postId) {
  "use workflow";
  try {
    return await renderBody(postId);
  } catch (err) {
    return await failRender(postId, err?.message || String(err));
  }
}

async function renderBody(postId) {
  const ctx = await beginRender(postId);
  if (!ctx.ok) return { postId, skipped: ctx.reason };

  await ensureScript(postId);

  let qa = await currentQa(postId);
  for (let attempt = 0; attempt < MAX_KEYFRAME_ATTEMPTS && !qa.pass; attempt++) {
    const requestId = await submitKeyframe(postId, attempt);
    let r;
    do {
      await sleep("15s");
      r = await pollPrediction(requestId);
    } while (!r.done);
    if (!r.url) {
      qa = { pass: false, issues: [r.error || "keyframe generation failed"] };
      continue;
    }
    qa = await storeAndQaKeyframe(postId, attempt, r.url);
  }
  if (!qa.pass) return await failRender(postId, `identity_qa: ${qa.issues?.join("; ") || "below threshold"}`);

  await ensureCaptions(postId);

  if (ctx.mediaType === "image") {
    return await finishRender(postId, { imageOnly: true });
  }

  const submitted = await submitVideo(postId);
  let result;
  for (;;) {
    await sleep("20s");
    result = await pollVideo(postId, submitted.requestId);
    if (result.done) break;
  }
  if (!result.url) return await failRender(postId, result.error || "video_failed");
  return await finishRender(postId, { videoUrl: result.url });
}

function wrap(err) {
  if (err instanceof WavespeedError || err instanceof ClaudeError) {
    if (err.retryable) return new RetryableError(err.message, { retryAfter: "30s" });
    return new FatalError(err.message);
  }
  return err;
}

async function loadPost(postId) {
  const post = await prisma.post.findUnique({ where: { id: postId }, include: { actor: true, targets: true } });
  if (!post) throw new FatalError(`Post ${postId} not found`);
  return post;
}

async function beginRender(postId) {
  "use step";
  const post = await loadPost(postId);
  if (["cancelled", "published", "partial"].includes(post.status)) return { ok: false, reason: post.status };
  if (!post.actor.imageUrl) return { ok: false, reason: "actor has no reference image" };
  await prisma.post.update({ where: { id: postId }, data: { status: "rendering", renderError: null } });
  console.log("[RENDER] begin", postId, post.actor.name);
  return { ok: true, mediaType: post.mediaType };
}

async function ensureScript(postId) {
  "use step";
  const post = await loadPost(postId);
  if (post.script?.keyframePrompt) return { cached: true };
  try {
    const { script, costCents } = await writeScript({
      actor: post.actor,
      idea: { idea: post.idea, pillar: post.pillar, hook: post.hook },
      mediaType: post.mediaType,
      clipLengthSec: post.clipLengthSec,
    });
    await prisma.post.update({ where: { id: postId }, data: { script, hook: script.hook || post.hook } });
    await logEvent({ postId, actorId: post.actorId, kind: "render", step: "script", costCents });
    return { cached: false };
  } catch (err) {
    throw wrap(err);
  }
}
ensureScript.maxRetries = 3;

async function currentQa(postId) {
  "use step";
  const post = await loadPost(postId);
  if (post.keyframeQa?.pass && post.keyframeUrl) return post.keyframeQa;
  return { pass: false };
}

async function submitKeyframe(postId, attempt) {
  "use step";
  const post = await loadPost(postId);
  try {
    const { requestId, prompt } = await submitKeyframeRequest({ actor: post.actor, script: post.script || {}, seed: 1000 + attempt * 7919 });
    await logEvent({ postId, actorId: post.actorId, kind: "render", step: "keyframe_submit", data: { attempt, requestId, prompt } });
    console.log("[RENDER] keyframe submitted", postId, "attempt", attempt, requestId);
    return requestId;
  } catch (err) {
    throw wrap(err);
  }
}
submitKeyframe.maxRetries = 2;

async function pollPrediction(requestId) {
  "use step";
  try {
    const r = await wsResult(requestId);
    if (r.status === "completed") return { done: true, url: r.outputs[0] || null };
    if (r.status === "failed") return { done: true, url: null, error: r.error };
    return { done: false };
  } catch (err) {
    throw wrap(err);
  }
}
pollPrediction.maxRetries = 5;

async function storeAndQaKeyframe(postId, attempt, sourceUrl) {
  "use step";
  const post = await loadPost(postId);
  try {
    const stored = await copyToBlob(sourceUrl, `keyframes/${post.actor.slug || post.actorId}/${postId}-${attempt}.jpg`, { contentType: "image/jpeg" });
    await logEvent({ postId, actorId: post.actorId, kind: "render", step: "keyframe", costCents: keyframeCents(post.actor), data: { attempt, url: stored.url } });
    const qa = await scoreIdentity({ actor: post.actor, candidateUrl: stored.url });
    await logEvent({ postId, actorId: post.actorId, kind: "render", step: "qa", status: qa.pass ? "ok" : "retry", costCents: qa.cents, message: `score ${qa.score.toFixed(2)}`, data: { attempt, issues: qa.issues } });
    const record = { pass: qa.pass, score: qa.score, issues: qa.issues, attempts: attempt + 1 };
    await prisma.post.update({ where: { id: postId }, data: { keyframeUrl: stored.url, keyframeQa: record } });
    console.log("[RENDER] keyframe", postId, "attempt", attempt, "score", qa.score);
    return record;
  } catch (err) {
    throw wrap(err);
  }
}
storeAndQaKeyframe.maxRetries = 2;

async function ensureCaptions(postId) {
  "use step";
  const post = await loadPost(postId);
  const needs = post.targets.filter((t) => !t.caption);
  if (!needs.length) return { cached: true };
  try {
    const { variants, costCents } = await writeVariants({ actor: post.actor, script: post.script, idea: { idea: post.idea }, platforms: PLATFORMS });
    for (const t of post.targets) {
      const v = variants[t.platform];
      if (!v) continue;
      await prisma.postTarget.update({ where: { id: t.id }, data: { caption: v.caption, title: v.title, hashtags: v.hashtags } });
    }
    await logEvent({ postId, actorId: post.actorId, kind: "render", step: "captions", costCents });
    return { cached: false };
  } catch (err) {
    throw wrap(err);
  }
}
ensureCaptions.maxRetries = 3;

async function submitVideo(postId) {
  "use step";
  const post = await loadPost(postId);
  if (post.creationId) {
    const existing = await prisma.creation.findUnique({ where: { id: post.creationId } });
    if (existing?.requestId) return { requestId: existing.requestId, creationId: existing.id };
  }
  const actor = post.actor;
  const cfg = renderConfig(actor);
  const clip = actor.defaultClip && typeof actor.defaultClip === "object" ? actor.defaultClip : {};
  const audio = clip.audio !== false;
  const duration = post.clipLengthSec === 10 ? 10 : 5;
  const prompt = buildMotionPrompt(actor, post.script || {});
  const body =
    actor.kind === "pet"
      ? { image: post.keyframeUrl, prompt, negative_prompt: negativeFor(actor), duration, resolution: "720p", enable_audio: audio, shot_type: "single" }
      : { image: post.keyframeUrl, prompt, negative_prompt: negativeFor(actor), duration, cfg_scale: 0.5, sound: audio };
  try {
    const requestId = await wsSubmit(cfg.video.slug, body);
    const creation = await prisma.creation.create({
      data: {
        userId: post.userId,
        actorId: actor.id,
        type: "video",
        title: post.hook || post.idea,
        prompt,
        provider: "wavespeed",
        requestId,
        keySource: "server",
        status: "processing",
        modelId: cfg.video.slug,
        aspectRatio: "9:16",
        duration,
        inputImages: [post.keyframeUrl],
        meta: { postId, credits: 0 },
      },
    });
    await prisma.post.update({ where: { id: postId }, data: { creationId: creation.id } });
    await logEvent({ postId, actorId: actor.id, kind: "render", step: "video_submit", costCents: videoCents(actor, { lengthSec: duration, audio }), data: { requestId, model: cfg.video.slug } });
    console.log("[RENDER] video submitted", postId, requestId);
    return { requestId, creationId: creation.id };
  } catch (err) {
    throw wrap(err);
  }
}
submitVideo.maxRetries = 2;

async function pollVideo(postId, requestId) {
  "use step";
  try {
    const r = await wsResult(requestId);
    if (r.status === "completed") {
      const url = r.outputs[0];
      return url ? { done: true, url } : { done: true, error: "completed without output" };
    }
    if (r.status === "failed") return { done: true, error: r.error };
    return { done: false };
  } catch (err) {
    throw wrap(err);
  }
}
pollVideo.maxRetries = 5;

async function finishRender(postId, { videoUrl, imageOnly } = {}) {
  "use step";
  const post = await loadPost(postId);
  let stored = null;
  if (videoUrl) {
    stored = await copyToBlob(videoUrl, `posts/${post.actor.slug || post.actorId}/${postId}.mp4`, { contentType: "video/mp4" });
    if (post.creationId) await prisma.creation.update({ where: { id: post.creationId }, data: { status: "completed", url: stored.url } });
  }
  const approved = Boolean(post.actor.autoPublish);
  await prisma.post.update({
    where: { id: postId },
    data: {
      status: approved ? "approved" : "draft",
      approvedAt: approved ? new Date() : null,
      approvedBy: approved ? "auto" : null,
      videoUrl: stored?.url ?? null,
      videoMeta: stored ? { bytes: stored.bytes, durationSec: post.clipLengthSec, width: 1080, height: 1920, hasAudio: post.actor.defaultClip?.audio !== false, model: RENDER[post.actor.kind === "pet" ? "pet" : "human"].video.slug } : (imageOnly ? { imageOnly: true } : null),
    },
  });
  if (approved) await prisma.postTarget.updateMany({ where: { postId, status: "pending" }, data: { status: "queued" } });
  await logEvent({ postId, actorId: post.actorId, kind: "render", step: "done", message: approved ? "auto-approved" : "draft" });
  console.log("[RENDER] done", postId, approved ? "approved" : "draft");
  return { postId, status: approved ? "approved" : "draft" };
}

async function failRender(postId, reason) {
  "use step";
  await prisma.post.update({ where: { id: postId }, data: { status: "failed", renderError: String(reason).slice(0, 1000) } });
  await prisma.postTarget.updateMany({ where: { postId, status: { in: ["pending", "queued"] } }, data: { status: "skipped" } });
  await logEvent({ postId, kind: "render", step: "failed", status: "failed", message: String(reason) });
  console.error("[RENDER] failed", postId, reason);
  return { postId, status: "failed", reason };
}
