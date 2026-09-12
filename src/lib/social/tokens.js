import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { getPlatformApp } from "./apps";

const REFRESH_AHEAD_MS = 10 * 60 * 1000;

/**
 * Return a usable access token for a channel, refreshing first when it is
 * about to expire. Persists rotated refresh tokens in the same update.
 */
export async function getFreshToken(channel, connector) {
  const now = Date.now();
  const exp = channel.tokenExpiresAt ? new Date(channel.tokenExpiresAt).getTime() : null;
  if (!exp || exp - now > REFRESH_AHEAD_MS) return decrypt(channel.accessTokenEnc);

  if (!channel.refreshTokenEnc || !connector.refresh) {
    await prisma.channel.update({ where: { id: channel.id }, data: { status: "expired", lastError: "Token expired and cannot be refreshed; reconnect." } });
    throw new Error(`${connector.label} token expired; reconnect the channel`);
  }
  const app = await getPlatformApp(connector.appKey);
  if (!app) throw new Error(`${connector.label} developer app is not configured`);
  try {
    const t = await connector.refresh({ app, channel, refreshToken: decrypt(channel.refreshTokenEnc) });
    if (!t?.accessToken) throw new Error("refresh returned no token");
    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        accessTokenEnc: encrypt(t.accessToken),
        ...(t.refreshToken ? { refreshTokenEnc: encrypt(t.refreshToken) } : {}),
        tokenExpiresAt: t.expiresAt ?? null,
        refreshExpiresAt: t.refreshExpiresAt ?? channel.refreshExpiresAt ?? null,
        status: "connected",
        lastError: null,
        lastCheckedAt: new Date(),
      },
    });
    console.log("[TOKEN_REFRESH] ok", connector.id, channel.id);
    return t.accessToken;
  } catch (err) {
    await prisma.channel.update({ where: { id: channel.id }, data: { status: "expired", lastError: `Refresh failed: ${err.message}`.slice(0, 500) } });
    throw err;
  }
}

/** Channels whose token expires within `withinMs` and can be refreshed. */
export async function channelsNeedingRefresh(withinMs = 3 * 24 * 3600 * 1000) {
  return prisma.channel.findMany({
    where: { status: { in: ["connected", "expiring"] }, refreshTokenEnc: { not: null }, tokenExpiresAt: { lte: new Date(Date.now() + withinMs) } },
  });
}
