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

/**
 * Turn a Recommendation into a brand Post (+ targets with ready captions) and
 * start the render workflow. Returns the Post.
 */
export async function createPostFromRecommendation(rec, { platforms, date, referenceImages = [], userId } = {}) {
  const actor = await prisma.actor.findUnique({ where: { id: rec.actorId } });
  if (!actor) throw new Error("Actor not found");
  const tz = actor.timezone || "America/New_York";
  const chosen = (platforms?.length ? platforms : rec.platforms).filter((p) => ["instagram", "facebook"].includes(p));
  if (!chosen.length) throw new Error("Pick at least one platform");
  const scheduledAt = /^\d{4}-\d{2}-\d{2}T/.test(date || "") ? new Date(date) : nextSlot(rec.bestTime || {}, tz);
  const planDate = todayIn(tz) <= scheduledAt.toISOString().slice(0, 10) ? scheduledAt.toISOString().slice(0, 10) : todayIn(tz);
  const last = await prisma.post.findFirst({ where: { actorId: actor.id, planDate }, orderBy: { sequence: "desc" } });
  const sequence = Math.max((last?.sequence ?? 99) + 1, 100);
  const isVideo = ["reel", "video"].includes(String(rec.format || "").toLowerCase());
  const brief = { ...(rec.visualBrief || {}), referenceImages };
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
      script: { visualBrief: brief, keyframePrompt: designSystemToImagePrompt(actor.designSystem, brief), overlayText: brief.overlayText || "", recommendationId: rec.id, compliance },
      targets: { create: targets },
    },
    include: { targets: true },
  });
  const run = await start(renderPostWorkflow, [post.id]);
  await prisma.post.update({ where: { id: post.id }, data: { renderRunId: run.runId } });
  await prisma.recommendation.update({ where: { id: rec.id }, data: { status: "used", postId: post.id } });
  console.log("[REC_POST]", actor.name, post.id, chosen.join(","), run.runId);
  return { ...post, renderRunId: run.runId, compliance };
}
