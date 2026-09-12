/**
 * Connector contract (one module per platform in src/lib/social/*.js).
 *
 * {
 *   id: "youtube",
 *   label: "YouTube",
 *   appKey: "youtube" | "meta" | "tiktok" | "pinterest" | "x",   // PlatformApp row / env fallback
 *   scopes: string[],
 *   pkce: boolean,
 *
 *   authUrl({ app, redirectUri, state, codeChallenge }) -> string
 *   exchangeCode({ app, redirectUri, code, codeVerifier }) ->
 *     { accessToken, refreshToken?, expiresAt?, refreshExpiresAt?, scopes[],
 *       accounts: [{ externalId, handle, displayName, avatarUrl, config, accessToken? }] }
 *     // accounts may carry their own token (Meta page tokens); otherwise the top-level token applies
 *   refresh({ app, channel, refreshToken }) -> { accessToken, refreshToken?, expiresAt?, refreshExpiresAt? } | null
 *   probe({ channel, token }) -> { ok, handle?, error? }
 *   prepare?({ channel, token }) -> config patch (e.g. TikTok creator_info, Pinterest boards)
 *   publishVideo({ channel, token, videoUrl, coverUrl, videoMeta, target, post }) ->
 *     { externalId, url?, pending: boolean, providerState? }
 *   publishImage?({ channel, token, imageUrl, target, post }) -> same shape
 *   fetchStatus({ channel, token, target }) -> { status: "published"|"processing"|"failed", externalId?, url?, error? }
 *   revoke?({ channel, token })
 * }
 */

export class PublishError extends Error {
  constructor(message, { platform, status, code, retryable = false, body } = {}) {
    super(message);
    this.name = "PublishError";
    this.platform = platform;
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.body = body;
  }
}
