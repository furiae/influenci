import { prisma } from "@/lib/prisma";

const KEY = "ai.mode";

/**
 * "api"          → the server calls Claude itself (ANTHROPIC_API_KEY, pay per token)
 * "subscription" → analysis, summaries, design-system and recommendations are done
 *                  by Claude.ai / Claude Code through the MCP connector on the
 *                  user's subscription; the server only stores and scores.
 */
export async function getAiMode() {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  const mode = row?.value?.mode;
  if (mode === "subscription" || mode === "api") return mode;
  return process.env.ANTHROPIC_API_KEY ? "api" : "subscription";
}

export async function setAiMode(mode) {
  const value = { mode: mode === "subscription" ? "subscription" : "api", updatedAt: new Date().toISOString() };
  await prisma.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  return value.mode;
}

/** True when the server should run Claude itself. */
export async function serverAiEnabled() {
  return (await getAiMode()) === "api" && Boolean(process.env.ANTHROPIC_API_KEY);
}

export function connectorUrl() {
  const base = (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")).replace(/\/$/, "");
  return `${base}/api/mcp`;
}

/** Standard 409 payload for routes that would otherwise spend API tokens. */
export function subscriptionHint(prompt) {
  return { error: "AI mode is set to 'subscription'. Do this in Claude through the Influenci connector.", connector: connectorUrl(), prompt, code: "ai_mode_subscription" };
}
