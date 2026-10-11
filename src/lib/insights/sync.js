import { prisma } from "@/lib/prisma";
import { getConnector } from "@/lib/social";
import { getFreshToken } from "@/lib/social/tokens";
import { buildPools, scoreChannelPost, SCORE_VERSION } from "./scoring";
import { logEvent } from "@/lib/scheduler/status";
import { start } from "workflow/api";
import { importChannelWorkflow } from "@/workflows/import-channel";

const SYNC_EVERY_MS = 24 * 3600 * 1000;

/** Re-score every post on a channel against the channel's own pool. */
export async function rescoreChannel(channelId) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return { scored: 0 };
  const posts = await prisma.channelPost.findMany({ where: { channelId }, select: { id: true, platform: true, likes: true, comments: true, shares: true, saves: true, views: true, reach: true, followersAtFetch: true, postedAt: true } });
  const now = Date.now();
  const pools = buildPools(posts, channel.followers || 0, now);
  let scored = 0;
  for (const p of posts) {
    const r = scoreChannelPost(p, { followers: channel.followers || 0, ...pools, now });
    await prisma.channelPost.update({ where: { id: p.id }, data: { score: r.score, scoreBreakdown: r.breakdown, engagementRate: r.engagementRate, reachRate: r.reachRate, scoreVersion: SCORE_VERSION } });
    scored += 1;
  }
  console.log("[RESCORE]", channel.platform, channel.handle, scored);
  return { scored };
}

/** Upsert a page of listed posts into ChannelPost; returns ids touched. */
export async function upsertListedPosts(channel, posts) {
  const ids = [];
  for (const p of posts) {
    const { raw, ...rest } = p;
    const row = await prisma.channelPost.upsert({
      where: { channelId_externalId: { channelId: channel.id, externalId: p.externalId } },
      create: { channelId: channel.id, actorId: channel.actorId, platform: channel.platform, ...rest, raw: raw || null, followersAtFetch: channel.followers || null, fetchedAt: new Date() },
      update: { caption: p.caption, mediaType: p.mediaType, mediaUrls: p.mediaUrls, thumbnailUrl: p.thumbnailUrl, url: p.url, likes: p.likes, comments: p.comments, shares: p.shares || undefined, fetchedAt: new Date(), ...(raw ? { raw } : {}) },
    });
    ids.push(row.id);
  }
  return ids;
}

/** Pull per-post insights for a batch of posts and write a metric snapshot. */
export async function refreshPostMetrics(channel, postIds) {
  const connector = getConnector(channel.platform);
  if (!connector?.fetchPostMetrics) return { updated: 0 };
  const token = await getFreshToken(channel, connector);
  const posts = await prisma.channelPost.findMany({ where: { id: { in: postIds } } });
  let updated = 0;
  for (const post of posts) {
    try {
      const m = await connector.fetchPostMetrics({ channel, token, post });
      const data = { metricsUpdatedAt: new Date(), followersAtFetch: post.followersAtFetch ?? channel.followers ?? null };
      if (!m.unavailable) {
        if (m.reach != null) data.reach = Math.round(m.reach);
        if (m.impressions != null) data.impressions = Math.round(m.impressions);
        if (m.clicks != null) data.clicks = Math.round(m.clicks);
        if (m.saves != null) data.saves = Math.round(m.saves);
        if (m.shares != null && m.shares > 0) data.shares = Math.round(m.shares);
        if (m.views != null && m.views > 0) data.views = Math.round(m.views);
        if (m.likes != null && m.likes > post.likes) data.likes = Math.round(m.likes);
        if (m.comments != null && m.comments > post.comments) data.comments = Math.round(m.comments);
        if (m.videoAvgWatchSec != null) data.videoAvgWatchSec = m.videoAvgWatchSec;
        if (m.reactionsByType) data.reactionsByType = m.reactionsByType;
      } else {
        data.raw = { ...(post.raw || {}), insightsUnavailable: m.error || true };
      }
      const row = await prisma.channelPost.update({ where: { id: post.id }, data });
      await prisma.channelPostMetric.create({ data: { channelPostId: post.id, likes: row.likes, comments: row.comments, shares: row.shares, saves: row.saves, views: row.views, reach: row.reach } });
      updated += 1;
    } catch (err) {
      if (err.retryable) throw err;
      console.warn("[POST_METRICS]", channel.platform, post.externalId, err.message);
    }
  }
  return { updated };
}

/** Account-level daily insights for a date range. */
export async function refreshAccountInsights(channel, { since, until }) {
  const connector = getConnector(channel.platform);
  if (!connector?.fetchAccountInsights) return { rows: 0 };
  const token = await getFreshToken(channel, connector);
  const rows = await connector.fetchAccountInsights({ channel, token, since, until });
  for (const r of rows) {
    const { date, raw, ...rest } = r;
    await prisma.channelDailyInsight.upsert({ where: { channelId_date: { channelId: channel.id, date } }, create: { channelId: channel.id, date, raw: raw || null, ...rest }, update: { raw: raw || null, ...rest } });
  }
  return { rows: rows.length };
}

/** Channels due for a daily sync (brand actors, importable connectors). */
export async function channelsDueForSync({ now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - SYNC_EVERY_MS);
  return prisma.channel.findMany({
    where: {
      status: { in: ["connected", "expiring"] },
      platform: { in: ["facebook", "instagram"] },
      actor: { kind: "brand", importStatus: { in: ["ready", "failed"] } },
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lte: cutoff } }],
    },
    include: { actor: { select: { id: true, importStatus: true, importRunId: true } } },
    take: 10,
  });
}

/** Start the import workflow for one channel (mode "import" = full history, "sync" = recent + metrics refresh). */
export async function startChannelImport(channelId, { mode = "import" } = {}) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");
  const run = await start(importChannelWorkflow, [channelId, { mode }]);
  await prisma.actor.update({ where: { id: channel.actorId }, data: { importStatus: "importing", importRunId: run.runId, importError: null } });
  await logEvent({ actorId: channel.actorId, kind: "import", step: "start", message: `${channel.platform} ${mode}`, data: { runId: run.runId, channelId } });
  console.log("[IMPORT] started", channel.platform, channel.handle, run.runId);
  return run.runId;
}

/** Ticker hook: kick off daily syncs for brand channels. */
export async function runChannelSync({ now = new Date() } = {}) {
  const due = await channelsDueForSync({ now });
  const out = [];
  for (const ch of due) {
    if (ch.actor.importStatus === "importing") continue;
    try {
      out.push({ channelId: ch.id, platform: ch.platform, runId: await startChannelImport(ch.id, { mode: "sync" }) });
    } catch (err) {
      out.push({ channelId: ch.id, platform: ch.platform, error: String(err?.message || err) });
    }
  }
  if (out.length) console.log("[CHANNEL_SYNC]", out);
  return out;
}
