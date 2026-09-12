import { prisma } from "@/lib/prisma";
import { FETCHERS } from "./fetchers";
import { decrypt } from "@/lib/crypto";
import { analyzeVideo, isYouTube } from "./watch";

/**
 * Engagement score used to rank benchmark posts across platforms:
 * weighted interactions, normalised by the account's follower count so a
 * small account's viral post still surfaces, with recency decay.
 */
export function scorePost(p, followers = 0, now = Date.now()) {
  const interactions = p.likes * 1 + p.comments * 3 + p.shares * 4 + p.views * 0.01;
  const perFollower = followers > 0 ? interactions / Math.sqrt(followers) : interactions;
  const ageDays = p.postedAt ? Math.max(0, (now - new Date(p.postedAt).getTime()) / 86400000) : 30;
  const decay = 1 / (1 + ageDays / 45);
  return Math.round(perFollower * decay * 100) / 100;
}

/** Fetch one competitor's latest posts and upsert them. */
export async function refreshCompetitor(competitorId, ctx = {}) {
  const c = await prisma.competitor.findUnique({ where: { id: competitorId } });
  if (!c) throw new Error("Competitor not found");
  const f = FETCHERS[c.platform];
  if (!f?.fn) {
    await prisma.competitor.update({ where: { id: c.id }, data: { lastError: `No fetcher for ${c.platform}: ${f?.needs || "unsupported"}` } });
    return { fetched: 0, skipped: true };
  }
  try {
    const { profile, posts } = await f.fn(c.handle, ctx);
    const now = Date.now();
    for (const p of posts) {
      const score = scorePost(p, profile.followers, now);
      await prisma.benchmarkPost.upsert({
        where: { competitorId_externalId: { competitorId: c.id, externalId: p.externalId } },
        create: { competitorId: c.id, platform: c.platform, ...p, score },
        update: { likes: p.likes, comments: p.comments, shares: p.shares, views: p.views, score, fetchedAt: new Date(), thumbnailUrl: p.thumbnailUrl, caption: p.caption },
      });
    }
    await prisma.competitor.update({
      where: { id: c.id },
      data: { externalId: profile.externalId, displayName: profile.displayName, url: profile.url, followers: profile.followers, lastFetchedAt: new Date(), lastError: null },
    });
    console.log("[BENCHMARK_REFRESH]", c.platform, c.handle, posts.length);
    return { fetched: posts.length };
  } catch (err) {
    await prisma.competitor.update({ where: { id: c.id }, data: { lastError: String(err?.message || err).slice(0, 500), lastFetchedAt: new Date() } });
    throw err;
  }
}

/** Instagram reads borrow one of the actor's own connected IG channels. */
export async function instagramContext(actorId) {
  const ch = await prisma.channel.findFirst({ where: { actorId, platform: "instagram", status: "connected" } });
  if (!ch) return {};
  return { igUserId: ch.externalId, accessToken: decrypt(ch.accessTokenEnc) };
}

/** Refresh every active competitor for an actor; returns per-competitor results. */
export async function refreshActorCompetitors(actorId) {
  const list = await prisma.competitor.findMany({ where: { actorId, active: true } });
  const igCtx = list.some((c) => c.platform === "instagram") ? await instagramContext(actorId) : {};
  const out = [];
  for (const c of list) {
    try {
      out.push({ handle: c.handle, platform: c.platform, ...(await refreshCompetitor(c.id, c.platform === "instagram" ? igCtx : {})) });
    } catch (err) {
      out.push({ handle: c.handle, platform: c.platform, error: String(err?.message || err) });
    }
  }
  return out;
}

/** Top benchmark posts for an actor (for the planner and the UI). */
export async function topBenchmarks(actorId, { limit = 12, days = 90 } = {}) {
  const since = new Date(Date.now() - days * 86400000);
  return prisma.benchmarkPost.findMany({
    where: { competitor: { actorId, active: true }, OR: [{ postedAt: { gte: since } }, { postedAt: null }] },
    orderBy: { score: "desc" },
    take: limit,
    include: { competitor: { select: { handle: true, platform: true, displayName: true } } },
  });
}

/** Analyse one benchmark post's video with Gemini and store the breakdown. */
export async function analyzeBenchmark(postId) {
  const p = await prisma.benchmarkPost.findUnique({ where: { id: postId }, include: { competitor: true } });
  if (!p) throw new Error("Benchmark post not found");
  const source = isYouTube(p.url) ? { youtubeUrl: p.url } : p.thumbnailUrl && /\.mp4(\?|$)/i.test(p.thumbnailUrl) ? { videoUrl: p.thumbnailUrl } : null;
  if (!source) throw new Error(`No watchable video source for ${p.platform} post (only YouTube links and direct mp4 files can be analysed)`);
  const analysis = await analyzeVideo({ ...source, context: `${p.platform} post by @${p.competitor.handle}. Caption: ${String(p.caption || "").slice(0, 300)}` });
  await prisma.benchmarkPost.update({ where: { id: postId }, data: { analysis, analyzedAt: new Date(), ...(analysis.durationSec ? { durationSec: Math.round(analysis.durationSec) } : {}) } });
  console.log("[BENCHMARK_ANALYZE]", p.platform, p.competitor.handle, analysis.formatLabel);
  return analysis;
}

/** Analyse the top N unanalysed benchmark posts for an actor. */
export async function analyzeTopBenchmarks(actorId, { limit = 5 } = {}) {
  const top = await topBenchmarks(actorId, { limit: 30 });
  const todo = top.filter((p) => !p.analysis && isYouTube(p.url)).slice(0, limit);
  const out = [];
  for (const p of todo) {
    try {
      out.push({ id: p.id, handle: p.competitor.handle, format: (await analyzeBenchmark(p.id)).formatLabel });
    } catch (err) {
      out.push({ id: p.id, handle: p.competitor.handle, error: String(err?.message || err) });
    }
  }
  return out;
}

/** Compact text block for prompts. Analysed posts contribute hook, format and why-it-works. */
export function benchmarksToPrompt(posts) {
  if (!posts?.length) return "";
  const lines = posts.slice(0, 10).map((p, i) => {
    const cap = String(p.caption || "").replace(/\s+/g, " ").slice(0, 140);
    const base = `${i + 1}. [${p.platform} @${p.competitor?.handle}] ${cap || "(no caption)"} — ${p.likes} likes, ${p.comments} comments, ${p.views} views`;
    const a = p.analysis;
    if (!a) return base;
    return `${base}\n   format: ${a.formatLabel || "?"} · hook: ${a.hook || "?"} · why it works: ${a.whyItWorks || "?"}${a.visualStyle ? ` · style: ${a.visualStyle}` : ""}`;
  });
  return `WHAT IS WORKING IN THIS NICHE RIGHT NOW (competitor posts with the highest engagement; use them as benchmarks for angle, hook style and format — never copy wording):\n${lines.join("\n")}`;
}
