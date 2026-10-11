import { prisma } from "@/lib/prisma";
import { generateStructured, usageCents } from "@/lib/content/claude";
import { RecommendationsSchema } from "@/lib/content/schemas";
import { bibleToSystemPrompt } from "@/lib/personas/bible";
import { topBenchmarks, benchmarksToPrompt } from "@/lib/benchmarks";
import { computeStats, statsToPrompt } from "./stats";
import { upcomingSeasons, seasonsToPrompt } from "./seasonality";
import { logEvent } from "@/lib/scheduler/status";

/** Heuristic baselines Claude's predictions must stay anchored to. */
export function predictionBaselines(stats) {
  const base = {};
  for (const [k, v] of Object.entries(stats.baselines || {})) base[k] = { n: v.n, medianReach: v.medianReach, p90Reach: v.p90Reach, medianER: v.medianER, p90ER: v.p90ER };
  return { overall: { medianReach: stats.kpis.medianReach, p90Reach: stats.kpis.p90Reach, medianER: stats.kpis.medianER, p90ER: stats.kpis.p90ER }, byPlatformFormat: base };
}

function baselinesToPrompt(b) {
  const pct = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(2)}%`);
  const n = (x) => (x == null ? "n/a" : Math.round(x).toLocaleString());
  return `PREDICTION ANCHORS (our real numbers; predictions must stay within about 0.5x–1.5x of the matching baseline unless the rationale explains why)
- overall: median reach ${n(b.overall.medianReach)}, P90 reach ${n(b.overall.p90Reach)}, median ER ${pct(b.overall.medianER)}, P90 ER ${pct(b.overall.p90ER)}
${Object.entries(b.byPlatformFormat).map(([k, v]) => `- ${k}: n=${v.n}, median reach ${n(v.medianReach)}, P90 ${n(v.p90Reach)}, median ER ${pct(v.medianER)}, P90 ${pct(v.p90ER)}`).join("\n") || "- (no per-format data yet)"}
Score scale: 10 = top decile of our own posts (≈ P90 ER or better), 5 = median, 1 = bottom decile.`;
}

/** Clamp a prediction to the anchors so the library stays honest. */
export function clampPrediction(rec, baselines) {
  const key = `${rec.platforms[0]}:${rec.format === "reel" || rec.format === "video" ? (rec.platforms[0] === "instagram" ? "reel" : "video") : rec.format === "carousel" ? "carousel" : "image"}`;
  const b = baselines.byPlatformFormat[key] || baselines.overall;
  const out = { ...rec };
  if (b.medianReach) {
    const lo = Math.round(b.medianReach * 0.4);
    const hi = Math.round((b.p90Reach || b.medianReach * 2) * 1.6);
    out.predictedReachLow = Math.max(lo, Math.min(hi, rec.predictedReachLow));
    out.predictedReachHigh = Math.max(out.predictedReachLow, Math.min(hi, rec.predictedReachHigh));
  }
  if (b.medianER) {
    const lo = b.medianER * 0.4;
    const hi = (b.p90ER || b.medianER * 2) * 1.6;
    out.predictedEngagementRate = Math.max(lo, Math.min(hi, rec.predictedEngagementRate));
  }
  return out;
}

/**
 * Generate `count` recommended posts for a brand actor, grounded in our own
 * stats, competitor benchmarks, seasonality and past prediction accuracy.
 */
export async function recommendPosts(actorId, { count = 10, platforms = ["instagram", "facebook"], focus = "" } = {}) {
  const actor = await prisma.actor.findUnique({ where: { id: actorId } });
  if (!actor) throw new Error("Actor not found");
  const stats = await computeStats(actorId);
  const benchmarks = await topBenchmarks(actorId, { limit: 12, days: 120 });
  const seasons = upcomingSeasons({ days: 30, extra: actor.brandProfile?.seasonality || [] });
  const prior = await prisma.recommendation.findMany({ where: { actorId, status: { in: ["suggested", "saved", "used"] } }, orderBy: { createdAt: "desc" }, take: 30, select: { title: true, status: true } });
  const baselines = predictionBaselines(stats);
  const calibration = actor.insightsSummary?.calibration;
  const ds = actor.designSystem;

  const system = `${bibleToSystemPrompt(actor)}\n\nYou are now the brand's content strategist. Every recommendation must cite evidence: our own posts by [id] and competitor posts by number. Predictions are numbers we will later check against reality, so be calibrated, not optimistic.`;
  const group = actor.brandProfile?.community?.facebookGroup;
  const surfaces = `SURFACES: "facebook" = the public Page (${actor.brandProfile?.followers?.facebook?.toLocaleString?.() || "?"} followers; reach comes from shares and the algorithm; recruitment, program news, winners, observances). ${group?.members ? `"facebook_group" = the private group "${group.name}" (${Number(group.members).toLocaleString()} members: entrants and their buddies; every post reaches the feed; questions, UGC asks, deadline reminders, leaderboard and Recruit Rewards belong here; it is posted by hand, so no reels that need the Page's tooling). Posts for the group use platforms ["facebook_group"] and are scored against members, not followers.` : ""}`;
  const user = `Propose ${count} new posts for ${platforms.join(" and ")}${focus ? ` with this focus: ${focus}` : ""}.

${surfaces}

${statsToPrompt(stats)}

${benchmarksToPrompt(benchmarks.map((b, i) => ({ ...b, caption: `[B${i + 1} ${b.id}] ${b.caption || ""}` })))}

${seasonsToPrompt(seasons)}

${baselinesToPrompt(baselines)}
${calibration ? `\nPAST PREDICTION ACCURACY: over ${calibration.n} published recommendations, mean absolute error ${calibration.mae} points, bias ${calibration.bias > 0 ? "+" : ""}${calibration.bias} (positive = we over-predicted). Correct for this bias.` : ""}
${ds ? `\nDESIGN SYSTEM SUMMARY: ${ds.summary || ""}\nLayouts: ${(ds.layoutPatterns || []).join("; ")}\nPalette: ${(ds.palette || []).map((p) => p.hex).join(", ")}` : ""}

ALREADY RECOMMENDED (do not repeat): ${prior.map((p) => `${p.title} (${p.status})`).join("; ") || "(none)"}

Rules:
- Mix formats and pillars; at least 3 should ride a seasonal moment in the next 30 days; at least 2 should be variations of our proven top posts; at least 2 should borrow a format competitors prove works that we have not tried.
- Captions ready to post, in the brand voice, with the right hashtags for the platform; giveaway posts must include "No purchase necessary" and point to the official rules.
- bestTime comes from BEST SLOTS above (local time); vary it across the list.
- basedOnOwnPosts / basedOnBenchmarks hold the exact ids you cite (the [id] values and the B-numbers' ids).`;

  const { data, usage } = await generateStructured({ system, user, schema: RecommendationsSchema, effort: "high", maxTokens: 12000 });
  const batchId = `b_${Date.now()}`;
  const created = [];
  for (const raw of data.recommendations.slice(0, count)) {
    const rec = clampPrediction(raw, baselines);
    const row = await prisma.recommendation.create({
      data: {
        actorId,
        batchId,
        kind: "post",
        platforms: rec.platforms,
        format: rec.format,
        title: rec.title.slice(0, 120),
        concept: rec.concept,
        hook: rec.hook,
        caption: rec.caption,
        hashtags: rec.hashtags.map((h) => h.replace(/^#/, "")),
        visualBrief: rec.visualBrief,
        bestTime: rec.bestTime,
        predictedScore: rec.predictedScore,
        predictedReachLow: rec.predictedReachLow,
        predictedReachHigh: rec.predictedReachHigh,
        predictedEngagementRate: rec.predictedEngagementRate,
        confidence: rec.confidence,
        rationale: rec.rationale,
        basedOn: { ownPosts: rec.basedOnOwnPosts, benchmarks: rec.basedOnBenchmarks, seasonalHook: rec.seasonalHook || null },
      },
    });
    created.push(row);
  }
  await logEvent({ actorId, kind: "recommend", step: "batch", costCents: usageCents(usage), message: `${created.length} recommendations`, data: { batchId } });
  console.log("[RECOMMEND]", actor.name, created.length);
  return { batchId, recommendations: created, costCents: usageCents(usage) };
}

/** "Make one like this": a single recommendation modelled on one of our posts or a benchmark post. */
export async function recommendLike(actorId, { channelPostId, benchmarkPostId, platforms = ["instagram", "facebook"] } = {}) {
  const src = channelPostId
    ? await prisma.channelPost.findFirst({ where: { id: channelPostId, actorId } })
    : await prisma.benchmarkPost.findFirst({ where: { id: benchmarkPostId, competitor: { actorId } }, include: { competitor: true } });
  if (!src) throw new Error("Source post not found");
  const label = channelPostId ? `our own post [${src.id}] (score ${src.score}/10, ER ${src.engagementRate != null ? (src.engagementRate * 100).toFixed(2) + "%" : "n/a"})` : `competitor @${src.competitor.handle}'s post [${src.id}] (${src.likes} likes, ${src.comments} comments)`;
  const focus = `exactly one post that applies the same format, angle and visual approach as ${label}: "${(src.caption || "").slice(0, 300)}"${src.analysis ? ` — analysis: ${JSON.stringify(src.analysis).slice(0, 800)}` : ""}. Do not copy wording.`;
  return recommendPosts(actorId, { count: 1, platforms, focus });
}
