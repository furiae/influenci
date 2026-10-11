import { prisma } from "@/lib/prisma";
import { generateStructured, usageCents } from "@/lib/content/claude";
import { InsightsSummarySchema } from "@/lib/content/schemas";
import { bibleToSystemPrompt } from "@/lib/personas/bible";
import { computeStats, statsToPrompt } from "./stats";
import { logEvent } from "@/lib/scheduler/status";

/**
 * Deterministic stats + a Claude narrative ("what's working, what isn't, do
 * this next"). Cached on Actor.insightsSummary; refreshed after every sync.
 */
export async function buildInsightsSummary(actorId) {
  const actor = await prisma.actor.findUnique({ where: { id: actorId } });
  if (!actor) throw new Error("Actor not found");
  const stats = await computeStats(actorId);
  let narrative = actor.insightsSummary?.narrative || null;
  let costCents = 0;
  if (stats.kpis.maturePosts >= 3 && process.env.ANTHROPIC_API_KEY) {
    const system = `${bibleToSystemPrompt(actor)}\n\nYou are now acting as the brand's analyst. Ground every statement in the numbers provided; cite posts by their [id]. Be direct and specific, no filler.`;
    const user = `${statsToPrompt(stats)}\n\nWrite the performance summary. "actions" must be concrete things to post or change next week, each with the expected impact in plain words.`;
    const { data, usage } = await generateStructured({ system, user, schema: InsightsSummarySchema, effort: "medium", maxTokens: 4000 });
    narrative = data;
    costCents = usageCents(usage);
  }
  const calibration = await computeCalibration(actorId);
  const summary = { computedAt: stats.computedAt, kpis: stats.kpis, bestSlots: stats.bestSlots, narrative, calibration };
  await prisma.actor.update({ where: { id: actorId }, data: { insightsSummary: summary } });
  await logEvent({ actorId, kind: "insights", step: "summary", costCents, message: narrative?.headline || "stats only" });
  return { stats, summary };
}

/** How well past predictions matched reality (learning loop). */
export async function computeCalibration(actorId) {
  const rows = await prisma.recommendation.findMany({ where: { actorId, actualScore: { not: null }, predictedScore: { not: null } }, select: { predictedScore: true, actualScore: true } });
  if (!rows.length) return null;
  const errs = rows.map((r) => r.predictedScore - r.actualScore);
  const mae = errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length;
  const bias = errs.reduce((a, e) => a + e, 0) / errs.length;
  return { n: rows.length, mae: Math.round(mae * 100) / 100, bias: Math.round(bias * 100) / 100 };
}

/** Fill Recommendation.actualScore once the published post has matured. */
export async function settleRecommendations(actorId) {
  const recs = await prisma.recommendation.findMany({ where: { actorId, status: "used", actualScore: null, postId: { not: null } }, include: { post: { include: { targets: { include: { channelPost: true } } } } } });
  let settled = 0;
  for (const r of recs) {
    const cps = r.post?.targets.map((t) => t.channelPost).filter((c) => c && c.score != null && !c.scoreBreakdown?.provisional) || [];
    if (!cps.length) continue;
    const actual = Math.round(cps.reduce((a, c) => a + c.score, 0) / cps.length);
    await prisma.recommendation.update({ where: { id: r.id }, data: { actualScore: actual } });
    settled += 1;
  }
  return { settled };
}
