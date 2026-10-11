import { sleep, FatalError, RetryableError } from "workflow";
import { prisma } from "@/lib/prisma";
import { wsSubmit, wsResult, WavespeedError } from "@/lib/identity/wavespeed";
import { submitKeyframeRequest } from "@/lib/identity/keyframe";
import { scoreIdentity } from "@/lib/identity/qa";
import { writeScript, writeVariants } from "@/lib/content/planner";
import { ClaudeError } from "@/lib/content/claude";
import { buildMotionPrompt, negativeFor } from "@/lib/personas/prompts";
import { renderConfig, videoCents, keyframeCents } from "@/lib/render/models";
import { copyToBlob } from "@/lib/render/store";
import { logEvent } from "@/lib/scheduler/status";
import { PLATFORMS } from "@/lib/platforms";
import { submitBrandKeyframe, brandMotionPrompt } from "@/lib/render/brand";
import { renderCardToBlob, renderSvgToBlob, wantsCard } from "@/lib/render/cards";

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
  await compositeCard(postId);

  let qa = await currentQa(postId);
  let { provider, brand } = qa.pass ? {} : await resolveImageProvider(postId);
  for (let attempt = 0; attempt < MAX_KEYFRAME_ATTEMPTS && !qa.pass; attempt++) {
    if (provider !== "wavespeed") {
      // Free providers (ZeroGPU Space, your own GPU endpoint) answer synchronously.
      const r = await generateKeyframeDirect(postId, attempt);
      if (!r.url) {
        qa = { pass: false, issues: [r.error || "keyframe generation failed"] };
        continue;
      }
      qa = await storeAndQaKeyframe(postId, attempt, r.url, { provider, stored: true });
      continue;
    }
    let r;
    try {
      const requestId = await submitKeyframe(postId, attempt);
      do {
        await sleep("15s");
        r = await pollPrediction(requestId);
      } while (!r.done);
    } catch (err) {
      // Wavespeed refused (no credits, bad key, outage). Brand posts fall back to
      // the free Space for the remaining attempts instead of failing the preview.
      if (!brand) throw err;
      r = { done: true, url: null, error: err?.message || String(err) };
    }
    if (!r.url) {
      qa = { pass: false, issues: [r.error || "keyframe generation failed"] };
      if (brand) provider = await pinImageProvider(postId, "zerogpu", r.error || "wavespeed failed");
      continue;
    }
    qa = await storeAndQaKeyframe(postId, attempt, r.url, { provider });
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
  if (!post.actor.imageUrl && post.actor.kind !== "brand") return { ok: false, reason: "actor has no reference image" };
  await prisma.post.update({ where: { id: postId }, data: { status: "rendering", renderError: null } });
  console.log("[RENDER] begin", postId, post.actor.name);
  return { ok: true, mediaType: post.mediaType };
}

async function ensureScript(postId) {
  "use step";
  const post = await loadPost(postId);
  if (post.script?.keyframePrompt) return { cached: true };
  if (post.actor.kind === "brand") {
    // Brand posts carry a visual brief instead of a character script.
    const { buildBrandImagePrompt } = await import("@/lib/render/brand");
    const script = { ...(post.script || {}), hook: post.hook || "", keyframePrompt: buildBrandImagePrompt(post.actor, post), durationSec: post.clipLengthSec };
    await prisma.post.update({ where: { id: postId }, data: { script } });
    return { cached: false, brand: true };
  }
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

/**
 * Brand card posts (visualBrief.template = winner | contender | throwback |
 * question) are composited from the brand templates instead of generated:
 * no provider cost, and the result passes QA by construction.
 */
async function compositeCard(postId) {
  "use step";
  const post = await loadPost(postId);
  if (post.actor.kind !== "brand" || !wantsCard(post)) return { skipped: true };
  if (post.keyframeQa?.pass && post.keyframeUrl) return { cached: true };
  const brief = post.script.visualBrief;
  try {
    const pathname = `keyframes/${post.actor.slug || post.actorId}/${postId}-card.png`;
    const card = brief.template
      ? await renderCardToBlob({ actor: post.actor, template: brief.template, fields: brief.fields || {}, photoUrl: brief.photoUrl || brief.referenceImages?.[0] || null, pathname })
      : await renderSvgToBlob({ actor: post.actor, svg: brief.svg, pathname });
    const record = { pass: true, score: 1, issues: [], attempts: 1, brand: true, composited: brief.template || "svg" };
    await prisma.post.update({ where: { id: postId }, data: { keyframeUrl: card.url, keyframeQa: record } });
    await logEvent({ postId, actorId: post.actorId, kind: "render", step: "keyframe", costCents: 0, message: `composited ${brief.template || "svg"} card`, data: { url: card.url, template: brief.template || "svg" } });
    console.log("[RENDER] card composited", postId, brief.template || "svg");
    return record;
  } catch (err) {
    throw new FatalError(`card: ${err.message}`);
  }
}
compositeCard.maxRetries = 2;

async function currentQa(postId) {
  "use step";
  const post = await loadPost(postId);
  if (post.keyframeQa?.pass && post.keyframeUrl) return post.keyframeQa;
  return { pass: false };
}

/**
 * Which image generator this post's keyframe comes from. Persona actors always
 * use Wavespeed (identity editing needs the reference photo); brand posts use
 * the generator picked in Settings → AI → Image generator. The choice is pinned
 * on the post so retries and the events log agree.
 */
async function resolveImageProvider(postId) {
  "use step";
  const post = await loadPost(postId);
  if (post.actor.kind !== "brand") return { provider: "wavespeed", brand: false };
  if (post.script?.keyframeProvider) return { provider: post.script.keyframeProvider, brand: true };
  const { getImageSettings } = await import("@/lib/render/image-providers");
  const { provider } = await getImageSettings();
  await prisma.post.update({ where: { id: postId }, data: { script: { ...(post.script || {}), keyframeProvider: provider } } });
  return { provider, brand: true };
}

/** Switch a brand post to another generator mid-render (used for the Wavespeed → free fallback). */
async function pinImageProvider(postId, provider, reason) {
  "use step";
  const post = await loadPost(postId);
  await prisma.post.update({ where: { id: postId }, data: { script: { ...(post.script || {}), keyframeProvider: provider } } });
  await logEvent({ postId, actorId: post.actorId, kind: "render", step: "keyframe_submit", status: "retry", message: `switching to ${provider}: ${String(reason).slice(0, 200)}`, data: { provider, from: post.script?.keyframeProvider || null } });
  console.warn("[RENDER] image provider fallback", postId, "→", provider, reason);
  return provider;
}

/** Free providers: generate, normalise and store the keyframe in one call. */
async function generateKeyframeDirect(postId, attempt) {
  "use step";
  const post = await loadPost(postId);
  const provider = post.script?.keyframeProvider || "zerogpu";
  const { generateBrandImage, getImageSettings } = await import("@/lib/render/image-providers");
  try {
    const settings = { ...(await getImageSettings()), provider };
    const refs = [...(post.script?.referenceImages || []), ...(post.script?.visualBrief?.referenceImages || [])].filter(Boolean);
    const pathname = `keyframes/${post.actor.slug || post.actorId}/${postId}-${attempt}.png`;
    const r = await generateBrandImage({ actor: post.actor, post, seed: 1000 + attempt * 7919, settings, pathname });
    await logEvent({ postId, actorId: post.actorId, kind: "render", step: "keyframe_submit", data: { attempt, provider, prompt: r.prompt, ignoredReferenceImages: refs.length || undefined } });
    console.log("[RENDER] keyframe generated", postId, "attempt", attempt, provider);
    return { url: r.url };
  } catch (err) {
    const message = err?.message || String(err);
    await logEvent({ postId, actorId: post.actorId, kind: "render", step: "keyframe_submit", status: "retry", message, data: { attempt, provider } });
    console.warn("[RENDER] keyframe failed", postId, "attempt", attempt, provider, message);
    return { url: null, error: `${provider}: ${message}` };
  }
}
generateKeyframeDirect.maxRetries = 1;

async function submitKeyframe(postId, attempt) {
  "use step";
  const post = await loadPost(postId);
  try {
    const { requestId, prompt } = post.actor.kind === "brand"
      ? await submitBrandKeyframe({ actor: post.actor, post, seed: 1000 + attempt * 7919 })
      : await submitKeyframeRequest({ actor: post.actor, script: post.script || {}, seed: 1000 + attempt * 7919 });
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

async function storeAndQaKeyframe(postId, attempt, sourceUrl, { provider = "wavespeed", stored: alreadyStored = false } = {}) {
  "use step";
  const post = await loadPost(postId);
  try {
    const stored = alreadyStored
      ? { url: sourceUrl }
      : await copyToBlob(sourceUrl, `keyframes/${post.actor.slug || post.actorId}/${postId}-${attempt}.jpg`, { contentType: "image/jpeg" });
    const costCents = provider === "wavespeed" ? keyframeCents(post.actor) : 0;
    await logEvent({ postId, actorId: post.actorId, kind: "render", step: "keyframe", costCents, message: provider === "wavespeed" ? undefined : `free (${provider})`, data: { attempt, url: stored.url, provider } });
    if (post.actor.kind === "brand") {
      const record = { pass: true, score: 1, issues: [], attempts: attempt + 1, brand: true, provider };
      await prisma.post.update({ where: { id: postId }, data: { keyframeUrl: stored.url, keyframeQa: record } });
      return record;
    }
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
  const prompt = actor.kind === "brand" ? brandMotionPrompt(actor, post) : buildMotionPrompt(actor, post.script || {});
  const body =
    actor.kind === "pet" || actor.kind === "brand"
      ? { image: post.keyframeUrl, prompt, negative_prompt: actor.kind === "brand" ? "blurry, distorted text, warped logo, extra limbs, watermark" : negativeFor(actor), duration, resolution: "720p", enable_audio: audio, shot_type: "single" }
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
  // Previews have no targets and no date; they are never auto-approved.
  const approved = Boolean(post.actor.autoPublish) && !post.script?.preview;
  await prisma.post.update({
    where: { id: postId },
    data: {
      status: approved ? "approved" : "draft",
      approvedAt: approved ? new Date() : null,
      approvedBy: approved ? "auto" : null,
      videoUrl: stored?.url ?? null,
      videoMeta: stored ? { bytes: stored.bytes, durationSec: post.clipLengthSec, width: 1080, height: 1920, hasAudio: post.actor.defaultClip?.audio !== false, model: renderConfig(post.actor).video.slug } : (imageOnly ? { imageOnly: true } : null),
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
