import { sleep, FatalError, RetryableError } from "workflow";
import { prisma } from "@/lib/prisma";
import { getConnector } from "@/lib/social";
import { getFreshToken } from "@/lib/social/tokens";
import { PublishError } from "@/lib/social/contract";
import { ClaudeError } from "@/lib/content/claude";
import { logEvent } from "@/lib/scheduler/status";
import { upsertListedPosts, refreshPostMetrics, refreshAccountInsights, rescoreChannel } from "@/lib/insights/sync";
import { analyzePending } from "@/lib/insights/analyze";
import { buildInsightsSummary } from "@/lib/insights/summary";
import { learnDesignSystem } from "@/lib/insights/design-system";
import { serverAiEnabled } from "@/lib/content/ai-mode";

const METRICS_BATCH = 15;
const ANALYZE_BATCH = 4;
const MAX_PAGES = 60; // 3000 posts

/**
 * Import a brand channel's history (mode "import") or refresh it (mode "sync"):
 * list posts page by page → per-post insights → account insights → Claude
 * analysis → re-score → narrative summary → design-system learning.
 * One provider call per step; every step re-reads the DB so replays are safe.
 */
export async function importChannelWorkflow(channelId, { mode = "import" } = {}) {
  "use workflow";
  try {
    const ctx = await beginImport(channelId, mode);
    if (!ctx.ok) return { channelId, skipped: ctx.reason };

    let cursor = ctx.cursor;
    for (let page = 0; page < MAX_PAGES; page++) {
      const r = await listPage(channelId, cursor, mode);
      cursor = r.nextCursor;
      if (!cursor || r.stop) break;
      await sleep("2s");
    }

    for (let i = 0; i < 400; i++) {
      const r = await metricsBatch(channelId, mode, ctx.startedAt);
      if (r.done) break;
      await sleep("1s");
    }

    await accountInsights(channelId, mode);

    for (let i = 0; i < (mode === "import" ? 80 : 10); i++) {
      const r = await analyzeBatch(channelId);
      if (r.done) break;
    }

    await rescore(channelId);
    await summarize(channelId);
    await learn(channelId);
    return await finishImport(channelId, { ok: true });
  } catch (err) {
    return await finishImport(channelId, { ok: false, error: err?.message || String(err) });
  }
}

function wrap(err) {
  if (err instanceof PublishError || err instanceof ClaudeError) return err.retryable ? new RetryableError(err.message, { retryAfter: "2m" }) : new FatalError(err.message);
  if (err?.retryable) return new RetryableError(err.message, { retryAfter: "2m" });
  return err;
}

async function loadChannel(channelId) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId }, include: { actor: true } });
  if (!channel) throw new FatalError(`Channel ${channelId} not found`);
  return channel;
}

async function beginImport(channelId, mode) {
  "use step";
  const channel = await loadChannel(channelId);
  const connector = getConnector(channel.platform);
  if (!connector?.listPosts) return { ok: false, reason: `${channel.platform} cannot be imported` };
  if (!["connected", "expiring"].includes(channel.status)) return { ok: false, reason: `channel is ${channel.status}` };
  try {
    const token = await getFreshToken(channel, connector);
    const probe = await connector.probe({ channel, token });
    if (!probe.ok) throw new FatalError(`probe failed: ${probe.error}`);
    await prisma.channel.update({ where: { id: channelId }, data: { ...(probe.followers != null ? { followers: probe.followers } : {}), ...(probe.mediaCount != null ? { mediaCount: probe.mediaCount } : {}), lastCheckedAt: new Date(), status: "connected", lastError: null } });
  } catch (err) {
    throw wrap(err);
  }
  await prisma.actor.update({ where: { id: channel.actorId }, data: { importStatus: "importing", importError: null } });
  await prisma.channel.update({ where: { id: channelId }, data: { syncCursor: mode === "import" ? null : channel.syncCursor } });
  console.log("[IMPORT] begin", channel.platform, channel.handle, mode);
  return { ok: true, cursor: null, startedAt: new Date().toISOString() };
}
beginImport.maxRetries = 2;

async function listPage(channelId, cursor, mode) {
  "use step";
  const channel = await loadChannel(channelId);
  const connector = getConnector(channel.platform);
  try {
    const token = await getFreshToken(channel, connector);
    const since = mode === "sync" && channel.lastSyncedAt ? new Date(channel.lastSyncedAt.getTime() - 14 * 86400000) : null;
    const { posts, nextCursor } = await connector.listPosts({ channel, token, cursor, since });
    const ids = await upsertListedPosts(channel, posts);
    await prisma.channel.update({ where: { id: channelId }, data: { syncCursor: { cursor: nextCursor, at: new Date().toISOString() } } });
    await logEvent({ actorId: channel.actorId, kind: "import", step: "list", message: `${posts.length} posts`, data: { cursor: Boolean(cursor), next: Boolean(nextCursor) } });
    console.log("[IMPORT] page", channel.platform, posts.length, nextCursor ? "more" : "end");
    return { count: ids.length, nextCursor, stop: posts.length === 0 };
  } catch (err) {
    throw wrap(err);
  }
}
listPage.maxRetries = 4;

async function metricsBatch(channelId, mode, startedAt) {
  "use step";
  const channel = await loadChannel(channelId);
  // Anything refreshed before this run started is stale; anything refreshed during it is not (keeps the loop finite).
  const staleBefore = mode === "import" ? new Date(startedAt) : new Date(Date.now() - 20 * 3600 * 1000);
  const recentOnly = mode === "sync" ? { OR: [{ metricsUpdatedAt: null }, { postedAt: { gte: new Date(Date.now() - 60 * 86400000) } }] } : {};
  const todo = await prisma.channelPost.findMany({
    where: { channelId, ...recentOnly, AND: [{ OR: [{ metricsUpdatedAt: null }, { metricsUpdatedAt: { lte: staleBefore } }] }] },
    orderBy: { postedAt: "desc" },
    take: METRICS_BATCH,
    select: { id: true },
  });
  if (!todo.length) return { done: true };
  try {
    const r = await refreshPostMetrics(channel, todo.map((t) => t.id));
    return { done: false, updated: r.updated };
  } catch (err) {
    throw wrap(err);
  }
}
metricsBatch.maxRetries = 4;

async function accountInsights(channelId, mode) {
  "use step";
  const channel = await loadChannel(channelId);
  const days = mode === "import" ? 90 : 4;
  try {
    const r = await refreshAccountInsights(channel, { since: new Date(Date.now() - days * 86400000), until: new Date() });
    await logEvent({ actorId: channel.actorId, kind: "import", step: "account_insights", message: `${r.rows} days` });
    return r;
  } catch (err) {
    if (err.retryable) throw wrap(err);
    console.warn("[IMPORT] account insights", channel.platform, err.message);
    return { rows: 0, error: err.message };
  }
}
accountInsights.maxRetries = 2;

async function analyzeBatch(channelId) {
  "use step";
  const channel = await loadChannel(channelId);
  if (!(await serverAiEnabled())) return { done: true, skipped: "AI mode is subscription (analyse in Claude via the connector)" };
  const pending = await prisma.channelPost.count({ where: { channelId, analyzedAt: null } });
  if (!pending) return { done: true };
  const r = await analyzePending(channel.actorId, { limit: ANALYZE_BATCH });
  const failed = r.filter((x) => x.error);
  if (failed.length === r.length && r.length) {
    const e = failed[0].error;
    if (/rate|connection|server error/i.test(e)) throw new RetryableError(e, { retryAfter: "1m" });
    console.warn("[IMPORT] analysis failing; stopping", e);
    return { done: true, error: e };
  }
  return { done: false, analyzed: r.length - failed.length };
}
analyzeBatch.maxRetries = 3;

async function rescore(channelId) {
  "use step";
  return rescoreChannel(channelId);
}

async function summarize(channelId) {
  "use step";
  const channel = await loadChannel(channelId);
  if (!(await serverAiEnabled())) return { skipped: "AI mode is subscription (run the weekly-review prompt in Claude)" };
  try {
    await buildInsightsSummary(channel.actorId);
    return { ok: true };
  } catch (err) {
    if (err instanceof ClaudeError && err.retryable) throw wrap(err);
    console.warn("[IMPORT] summary", err.message);
    return { ok: false, error: err.message };
  }
}
summarize.maxRetries = 2;

async function learn(channelId) {
  "use step";
  const channel = await loadChannel(channelId);
  if (!channel.actor.designSystem) return { skipped: "no design system yet" };
  if (!(await serverAiEnabled())) return { skipped: "AI mode is subscription (run the extract-design-system prompt in Claude)" };
  try {
    const r = await learnDesignSystem(channel.actorId);
    return r;
  } catch (err) {
    if (err instanceof ClaudeError && err.retryable) throw wrap(err);
    console.warn("[IMPORT] learn", err.message);
    return { ok: false, error: err.message };
  }
}
learn.maxRetries = 2;

async function finishImport(channelId, { ok, error }) {
  "use step";
  const channel = await loadChannel(channelId);
  const count = await prisma.channelPost.count({ where: { channelId } });
  await prisma.channel.update({ where: { id: channelId }, data: { lastSyncedAt: new Date() } });
  await prisma.actor.update({ where: { id: channel.actorId }, data: { importStatus: ok ? "ready" : "failed", importError: ok ? null : String(error).slice(0, 1000), lastImportAt: new Date() } });
  await logEvent({ actorId: channel.actorId, kind: "import", step: ok ? "done" : "failed", status: ok ? "ok" : "failed", message: ok ? `${count} posts` : String(error) });
  console.log("[IMPORT] finish", channel.platform, channel.handle, ok ? "ok" : `failed: ${error}`, count);
  return { channelId, ok, posts: count, error: error || null };
}
