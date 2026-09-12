import { prisma } from "@/lib/prisma";
import { getConnector } from "@/lib/social";
import { getFreshToken, channelsNeedingRefresh } from "@/lib/social/tokens";
import { recomputePostStatus } from "./status";

/**
 * Housekeeping that runs every tick:
 *  - targets stuck in "publishing" for > 45 min: ask the provider once more
 *  - channels not checked in 24 h: probe
 *  - tokens expiring within 3 days: refresh
 */
export async function runPoller({ now = new Date() } = {}) {
  const out = { stale: 0, recovered: 0, failed: 0, probed: 0, refreshed: 0, errors: [] };

  const stale = await prisma.postTarget.findMany({
    where: { status: "publishing", lockedAt: { lte: new Date(now.getTime() - 45 * 60 * 1000) } },
    include: { channel: true, post: true },
    take: 50,
  });
  for (const t of stale) {
    out.stale += 1;
    const connector = getConnector(t.platform);
    const externalId = t.externalId || t.providerState?.externalId;
    if (!connector || !t.channel || !externalId) {
      await prisma.postTarget.update({ where: { id: t.id }, data: { status: "failed", error: t.error || "publish never completed", lockedAt: null } });
      out.failed += 1;
      await recomputePostStatus(t.postId);
      continue;
    }
    try {
      const token = await getFreshToken(t.channel, connector);
      const r = await connector.fetchStatus({ channel: t.channel, token, target: { ...t, externalId } });
      if (r.status === "published") {
        await prisma.postTarget.update({ where: { id: t.id }, data: { status: "published", externalId: r.externalId || externalId, url: r.url || t.url, publishedAt: new Date(), lockedAt: null, error: null } });
        out.recovered += 1;
      } else if (r.status === "failed") {
        await prisma.postTarget.update({ where: { id: t.id }, data: { status: "failed", error: r.error || "provider reported failure", lockedAt: null } });
        out.failed += 1;
      }
      await recomputePostStatus(t.postId);
    } catch (err) {
      out.errors.push(`${t.platform}: ${err.message}`);
    }
  }

  const toProbe = await prisma.channel.findMany({
    where: { status: { in: ["connected", "expiring", "error"] }, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lte: new Date(now.getTime() - 24 * 3600 * 1000) } }] },
    take: 20,
  });
  for (const ch of toProbe) {
    const connector = getConnector(ch.platform);
    if (!connector) continue;
    try {
      const token = await getFreshToken(ch, connector);
      const r = await connector.probe({ channel: ch, token });
      await prisma.channel.update({ where: { id: ch.id }, data: { status: r.ok ? "connected" : "error", lastError: r.ok ? null : r.error, lastCheckedAt: new Date() } });
      out.probed += 1;
    } catch (err) {
      out.errors.push(`${ch.platform} probe: ${err.message}`);
    }
  }

  for (const ch of await channelsNeedingRefresh()) {
    const connector = getConnector(ch.platform);
    if (!connector?.refresh) continue;
    try {
      await getFreshToken({ ...ch, tokenExpiresAt: new Date(0) }, connector); // force refresh
      out.refreshed += 1;
    } catch (err) {
      out.errors.push(`${ch.platform} refresh: ${err.message}`);
    }
  }

  if (out.stale || out.probed || out.refreshed || out.errors.length) console.log("[POLLER]", out);
  return out;
}
