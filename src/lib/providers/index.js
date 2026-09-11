import { estimateCredits } from "@/lib/credits";
export { estimateCredits };
import wavespeed from "./wavespeed";
import muapi from "./muapi";
import zerogpu from "./zerogpu";

/**
 * Provider adapter contract
 * -------------------------
 * {
 *   id: "wavespeed",
 *   label: "Wavespeed",
 *   envKey: "WAVESPEED_API_KEY" | null,   // server-side key env var (null = keyless)
 *   allowUserKey: boolean,                // may users paste their own key?
 *   keyHint: "ws_...",
 *   models: [{
 *     id: "wavespeed/wan-2.2-i2v-480p",   // globally unique
 *     name, description,
 *     kind: "i2v" | "t2v" | "lipsync",    // i2v/lipsync need images[0]
 *     params: { duration: { options|min/max, default }, ... },
 *     costPerSecond: number,              // credits per second of output
 *     rates?: { [resolution]: number },   // overrides costPerSecond by settings.resolution
 *     free?: boolean,
 *   }],
 *   submit({ model, prompt, images, settings, apiKey, webhookUrl }) -> {
 *     requestId: string,
 *     meta?: object,                      // stored on Creation.meta
 *     run?: () => Promise<{ url }>,       // optional background job (executed with next/server after())
 *   },
 *   status({ model, requestId, apiKey, creation }) -> { status, url?, error? }
 * }
 */

export const PROVIDERS = { wavespeed, muapi, zerogpu };
export const DEFAULT_PROVIDER = "wavespeed";

const ALL_MODELS = Object.values(PROVIDERS).flatMap((p) =>
  p.models.map((m) => ({ ...m, provider: p.id }))
);

export function findModel(modelId) {
  const model = ALL_MODELS.find((m) => m.id === modelId);
  if (!model) return null;
  return { model, provider: PROVIDERS[model.provider] };
}

export function getProvider(id) {
  return PROVIDERS[id] || null;
}

export function serverKeyFor(provider) {
  if (!provider.envKey) return null;
  return process.env[provider.envKey] || (provider.legacyEnvKey ? process.env[provider.legacyEnvKey] : null) || null;
}

/** Providers the server can run without a user key. */
export function providerConfigured(provider) {
  if (!provider.envKey) return true;
  return Boolean(serverKeyFor(provider));
}

/**
 * Pick the key to use. A user's own key wins and makes the generation free
 * (credit-wise) for them.
 */
export function resolveApiKey(provider, userKeys) {
  const userKey = provider.allowUserKey && userKeys && typeof userKeys === "object" ? userKeys[provider.id] : null;
  if (userKey && String(userKey).trim()) return { apiKey: String(userKey).trim(), keySource: "user" };
  const serverKey = serverKeyFor(provider);
  if (serverKey) return { apiKey: serverKey, keySource: "server" };
  if (!provider.envKey) return { apiKey: null, keySource: "server" };
  return { apiKey: null, keySource: null };
}

/** Public (secret-free) catalog for the client. */
export function listModels() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    configured: providerConfigured(p),
    allowUserKey: p.allowUserKey,
    keyHint: p.keyHint || "",
    keyUrl: p.keyUrl || "",
    models: p.models.map((m) => ({ ...m, provider: p.id })),
  }));
}
