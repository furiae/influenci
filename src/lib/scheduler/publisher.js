import { prisma } from "@/lib/prisma";
import { start } from "workflow/api";
import { publishTargetWorkflow } from "@/workflows/publish-target";
import { resolveCadence, slotsCount } from "./cadence";
import { implementedPlatforms } from "@/lib/social";
import { ymdIn } from "@/lib/time";
import { logEvent } from "./status";

/**
 * Find approved targets that are due, respect per-channel daily caps and
 * spacing, claim them atomically and start a publish workflow for each.
 * Safe to call repeatedly (duplicate ticks cannot double-publish).
 */
export async function runPublisher({ now = new Date(), limit = 25 } = {}) {
  const platforms = implementedPlatforms();
  const due = await prisma.postTarget.findMany({
    where: { status: "queued", scheduledAt: { lte: now }, platform: { in: platforms }, post: { status: { in: ["approved", "publishing", "partial"] } } },
    orderBy: { scheduledAt: "asc" },
    take: limit * 2,
    include: { post: { include: { actor: true } } },
  });
  const results = [];
  const startedPerChannel = new Map();

  for (const t of due) {
    if (results.filter((r) => r.started).length >= limit) break;
    const actor = t.post.actor;
    const channel = await prisma.channel.findFirst({ where: { actorId: actor.id, platform: t.platform, status: { in: ["connected", "expiring"] } } });
    if (!channel) {
      results.push({ target: t.id, platform: t.platform, skipped: "no channel" });
      continue;
    }
    const cadence = resolveCadence(actor);
    const tz = actor.timezone || "America/New_York";
    const today = ymdIn(now, tz);
    const cap = slotsCount(cadence.platforms[t.platform].perDay, today);
    const publishedToday = await prisma.postTarget.count({ where: { channelId: channel.id, status: "published", publishedAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) } } });
    const alreadyStarted = startedPerChannel.get(channel.id) || 0;
    if (cap > 0 && publishedToday + alreadyStarted >= cap) {
      results.push({ target: t.id, platform: t.platform, skipped: "daily cap" });
      continue;
    }
    const spacingMs = (cadence.minSpacingMinutes || 0) * 60 * 1000;
    if (channel.lastPublishedAt && alreadyStarted === 0 && now.getTime() - new Date(channel.lastPublishedAt).getTime() < spacingMs) {
      results.push({ target: t.id, platform: t.platform, skipped: "spacing" });
      continue;
    }

    // Atomic claim: only one tick can flip queued -> publishing.
    const claim = await prisma.postTarget.updateMany({ where: { id: t.id, status: "queued" }, data: { status: "publishing", lockedAt: now, channelId: channel.id } });
    if (claim.count !== 1) {
      results.push({ target: t.id, platform: t.platform, skipped: "claimed elsewhere" });
      continue;
    }
    try {
      const run = await start(publishTargetWorkflow, [t.id]);
      await prisma.postTarget.update({ where: { id: t.id }, data: { publishRunId: run.runId } });
      await prisma.post.updateMany({ where: { id: t.postId, status: "approved" }, data: { status: "publishing" } });
      startedPerChannel.set(channel.id, alreadyStarted + 1);
      results.push({ target: t.id, platform: t.platform, actor: actor.name, started: run.runId });
      console.log("[PUBLISHER] started", t.platform, actor.name, run.runId);
    } catch (err) {
      await prisma.postTarget.update({ where: { id: t.id }, data: { status: "queued", lockedAt: null, error: `start failed: ${err.message}` } });
      await logEvent({ postId: t.postId, actorId: actor.id, kind: "publish", step: "start", status: "failed", message: String(err?.message || err) });
      results.push({ target: t.id, platform: t.platform, error: err.message });
    }
  }
  return results;
}
