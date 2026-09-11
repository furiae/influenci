import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { PLATFORM_APPS } from "@/lib/platforms";

/** Env var names used when no PlatformApp row exists. */
const ENV = {
  meta: ["META_APP_ID", "META_APP_SECRET"],
  tiktok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  youtube: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  pinterest: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"],
  x: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
};

export function appKeyForPlatform(platform) {
  for (const [key, app] of Object.entries(PLATFORM_APPS)) if (app.platforms.includes(platform)) return key;
  return null;
}

export function baseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")).replace(/\/$/, "");
}

export function redirectUri(platform) {
  return `${baseUrl()}/api/social/${platform}/callback`;
}

/**
 * Credentials for a developer app. DB row wins; env vars are the fallback.
 * Returns { clientId, clientSecret, extra, source } or null.
 */
export async function getPlatformApp(appKey) {
  const row = await prisma.platformApp.findUnique({ where: { platform: appKey } });
  if (row?.clientId && row?.clientSecretEnc) {
    return { clientId: row.clientId, clientSecret: decrypt(row.clientSecretEnc), extra: row.extra || {}, source: "db" };
  }
  const [idVar, secretVar] = ENV[appKey] || [];
  const clientId = idVar && process.env[idVar];
  const clientSecret = secretVar && process.env[secretVar];
  if (clientId && clientSecret) return { clientId, clientSecret, extra: row?.extra || {}, source: "env" };
  return null;
}

/** Owner-facing summary: never includes the secret. */
export async function listPlatformApps() {
  const rows = await prisma.platformApp.findMany();
  const byKey = Object.fromEntries(rows.map((r) => [r.platform, r]));
  return Object.entries(PLATFORM_APPS).map(([key, meta]) => {
    const row = byKey[key];
    const [idVar, secretVar] = ENV[key] || [];
    const envConfigured = Boolean(idVar && process.env[idVar] && secretVar && process.env[secretVar]);
    return {
      key,
      label: meta.label,
      platforms: meta.platforms,
      portal: meta.portal,
      clientId: row?.clientId || (envConfigured ? process.env[idVar] : ""),
      hasSecret: Boolean(row?.clientSecretEnc) || envConfigured,
      source: row?.clientSecretEnc ? "db" : envConfigured ? "env" : "none",
      extra: row?.extra || {},
      reviewStatus: row?.reviewStatus || {},
      redirectUris: meta.platforms.map(redirectUri),
      updatedAt: row?.updatedAt || null,
    };
  });
}

export async function savePlatformApp(appKey, { clientId, clientSecret, extra, reviewStatus }) {
  if (!PLATFORM_APPS[appKey]) throw new Error("Unknown platform app");
  const existing = await prisma.platformApp.findUnique({ where: { platform: appKey } });
  const data = {
    clientId: clientId !== undefined ? String(clientId).trim() : existing?.clientId || "",
    clientSecretEnc: clientSecret ? encrypt(String(clientSecret).trim()) : existing?.clientSecretEnc || "",
    extra: extra !== undefined ? extra : existing?.extra ?? undefined,
    reviewStatus: reviewStatus !== undefined ? reviewStatus : existing?.reviewStatus ?? undefined,
  };
  return prisma.platformApp.upsert({ where: { platform: appKey }, update: data, create: { platform: appKey, ...data } });
}
