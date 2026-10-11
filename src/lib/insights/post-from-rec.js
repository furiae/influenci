import { prisma } from "@/lib/prisma";
import { start } from "workflow/api";
import { renderPostWorkflow } from "@/workflows/render-post";
import { enforceLimits } from "@/lib/content/limits";
import { checkGiveawayCaption } from "@/lib/content/brand-profile";
import { todayIn, addDays, localTimeToUtc } from "@/lib/time";
import { designSystemToImagePrompt } from "./design-system";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Next occurrence (UTC Date) of a weekday/hour in the actor's timezone, at least 2 h from now. */
export function nextSlot({ weekday, hourLocal }, tz, now = new Date()) {
  const wanted = WEEKDAYS.findIndex((w) => w.startsWith(String(weekday || "").toLowerCase().slice(0, 3)));
  const hour = Number.isFinite(hourLocal) ? Math.max(6, Math.min(21, hourLocal)) : 10;
  let ymd = todayIn(tz);
  for (let i = 0; i < 8; i++) {
    const [y, m, d] = ymd.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const at = localTimeToUtc(ymd, `${String(hour).padStart(2, "0")}:00`, tz);
    if ((wanted < 0 || dow === wanted) && at.getTime() > now.getTime() + 2 * 3600 * 1000) return at;
    ymd = addDays(ymd, 1);
  }
  return new Date(now.getTime() + 24 * 3600 * 1000);
}

/** Build the per-platform targets (captions fitted to each platform's limits) for a recommendation. */
async function buildTargets(actor, rec, chosen, scheduledAt) {
  const compliance = {};
  const targets = [];
  for (const [i, platform] of chosen.entries()) {
    const v = enforceLimits(platform, { caption: rec.caption || rec.concept, hashtags: rec.hashtags, title: rec.title }, null);
    let check = null;
    if (process.env.ANTHROPIC_API_KEY && /giveaway|win|enter|contest|sweepstake|prize|challenge/i.test(`${rec.caption} ${rec.title}`)) {
      try { check = await checkGiveawayCaption({ actor, caption: v.caption, platform }); } catch {}
      if (check) compliance[platform] = check;
    }
    targets.push({ platform, slotIndex: 100, scheduledAt: new Date(scheduledAt.getTime() + i * 20 * 60 * 1000), status: "pending", caption: v.caption, title: v.title, hashtags: v.hashtags });
  }
  return { targets, compliance };
}

async function nextSequence(actorId, planDate) {
  const last = await prisma.post.findFirst({ where: { actorId, planDate }, orderBy: { sequence: "desc" } });
  return Math.max((last?.sequence ?? 99) + 1, 100);
}

/**
 * Turn a Recommendation into a brand Post and start the render workflow.
 * Returns the Post.
 *
 * Default: schedules it (targets with ready captions, best-time slot) as a
 * draft for approval in the calendar.
 * `preview: true`: renders only. No platforms, no date, no targets, so it
 * can never be published; it stays off the calendar until
 * schedulePreviewPost() turns it into a scheduled draft.
 */
export async function createPostFromRecommendation(rec, { platforms, date, referenceImages = [], userId, preview = false } = {}) {
  const actor = await prisma.actor.findUnique({ where: { id: rec.actorId } });
  if (!actor) throw new Error("Actor not found");
  const tz = actor.timezone || "America/New_York";
  const chosen = preview ? [] : (platforms?.length ? platforms : rec.platforms).filter((p) => ["instagram", "facebook"].includes(p));
  if (!preview && !chosen.length) throw new Error("Pick at least one platform");
  const scheduledAt = preview ? null : /^\d{4}-\d{2}-\d{2}T/.test(date || "") ? new Date(date) : nextSlot(rec.bestTime || {}, tz);
  const planDate = preview ? todayIn(tz) : todayIn(tz) <= scheduledAt.toISOString().slice(0, 10) ? scheduledAt.toISOString().slice(0, 10) : todayIn(tz);
  const sequence = await nextSequence(actor.id, planDate);
  const isVideo = ["reel", "video"].includes(String(rec.format || "").toLowerCase());
  const brief = { ...(rec.visualBrief || {}), referenceImages };
  const { targets, compliance } = preview ? { targets: [], compliance: {} } : await buildTargets(actor, rec, chosen, scheduledAt);
  const post = await prisma.post.create({
    data: {
      actorId: actor.id,
      userId: userId || actor.userId,
      planDate,
      sequence,
      mediaType: isVideo ? "video" : "image",
      clipLengthSec: 5,
      status: "planned",
      idea: rec.concept,
      pillar: rec.basedOn?.seasonalHook || rec.format || null,
      hook: rec.hook || rec.title,
      script: { visualBrief: brief, keyframePrompt: designSystemToImagePrompt(actor.designSystem, brief), overlayText: brief.overlayText || "", recommendationId: rec.id, compliance, ...(preview ? { preview: true } : {}) },
      targets: { create: targets },
    },
    include: { targets: true },
  });
  const run = await start(renderPostWorkflow, [post.id]);
  await prisma.post.update({ where: { id: post.id }, data: { renderRunId: run.runId } });
  await prisma.recommendation.update({ where: { id: rec.id }, data: { status: preview ? "saved" : "used", postId: post.id } });
  console.log(preview ? "[REC_PREVIEW]" : "[REC_POST]", actor.name, post.id, chosen.join(","), run.runId);
  return { ...post, renderRunId: run.runId, compliance };
}

/**
 * Final step after a preview: pick platforms + date. Adds the targets, moves
 * the post to that day and clears the preview flag; the (already rendered)
 * post then shows in the calendar as a draft waiting for approval.
 */
export async function schedulePreviewPost(rec, { platforms, date, userId } = {}) {
  if (!rec.postId) throw new Error("Preview the post first");
  const post = await prisma.post.findFirst({ where: { id: rec.postId, ...(userId ? { userId } : {}) }, include: { targets: true } });
  if (!post) throw new Error("Preview post not found");
  if (!post.script?.preview) throw new Error("This post is already scheduled");
  if (post.status === "cancelled") throw new Error("This preview was discarded");
  const actor = await prisma.actor.findUnique({ where: { id: post.actorId } });
  const tz = actor.timezone || "America/New_York";
  const chosen = (platforms?.length ? platforms : rec.platforms).filter((p) => ["instagram", "facebook"].includes(p));
  if (!chosen.length) throw new Error("Pick at least one platform");
  const scheduledAt = /^\d{4}-\d{2}-\d{2}T/.test(date || "") ? new Date(date) : nextSlot(rec.bestTime || {}, tz);
  const planDate = todayIn(tz) <= scheduledAt.toISOString().slice(0, 10) ? scheduledAt.toISOString().slice(0, 10) : todayIn(tz);
  const sequence = planDate === post.planDate ? post.sequence : await nextSequence(actor.id, planDate);
  const { targets, compliance } = await buildTargets(actor, rec, chosen, scheduledAt);
  const { preview: _preview, ...script } = post.script || {};
  const rendered = Boolean(post.keyframeUrl && (post.mediaType === "image" || post.videoUrl));
  const updated = await prisma.post.update({
    where: { id: post.id },
    data: {
      planDate,
      sequence,
      script: { ...script, compliance },
      ...(rendered && post.status !== "rendering" ? { status: "draft" } : {}),
      targets: { deleteMany: {}, create: targets },
    },
    include: { targets: true },
  });
  await prisma.recommendation.update({ where: { id: rec.id }, data: { status: "used" } });
  console.log("[REC_SCHEDULE]", actor.name, post.id, chosen.join(","), scheduledAt.toISOString());
  return { ...updated, compliance };
}

/** Throw away a preview: cancels the post and detaches it from the recommendation. */
export async function discardPreviewPost(rec, { userId } = {}) {
  if (!rec.postId) return null;
  const post = await prisma.post.findFirst({ where: { id: rec.postId, ...(userId ? { userId } : {}) } });
  if (post?.script?.preview) await prisma.post.update({ where: { id: post.id }, data: { status: "cancelled" } });
  await prisma.recommendation.update({ where: { id: rec.id }, data: { postId: null, status: rec.status === "used" ? "saved" : rec.status } });
  return post;
}
