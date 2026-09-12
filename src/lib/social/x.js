import { apiFetch, formBody } from "./http";
import { PublishError } from "./contract";
import { readAll } from "./range";

const SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];
const API = "https://api.x.com/2";
const CHUNK = 4 * 1024 * 1024;

function basic(app) {
  return `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64")}`;
}

async function me(token) {
  const { body } = await apiFetch(`${API}/users/me?user.fields=profile_image_url,username,name`, { platform: "x", headers: { Authorization: `Bearer ${token}` } });
  if (!body.data) throw new PublishError("x: could not read the account", { platform: "x", body });
  return body.data;
}

async function uploadMedia(token, bytes, { mediaType, category }) {
  const init = await apiFetch(`${API}/media/upload/initialize`, {
    platform: "x",
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ media_type: mediaType, total_bytes: bytes.length, media_category: category }),
  });
  const mediaId = init.body?.data?.id || init.body?.media_id_string || init.body?.id;
  if (!mediaId) throw new PublishError("x: media initialize returned no id", { platform: "x", body: init.body });

  for (let i = 0, seg = 0; i < bytes.length; i += CHUNK, seg++) {
    const form = new FormData();
    form.append("segment_index", String(seg));
    form.append("media", new Blob([bytes.subarray(i, Math.min(i + CHUNK, bytes.length))]), "chunk");
    const res = await fetch(`${API}/media/upload/${mediaId}/append`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    if (!res.ok && res.status !== 204) {
      const t = await res.text();
      throw new PublishError(`x: append ${res.status} ${t.slice(0, 200)}`, { platform: "x", status: res.status, retryable: res.status === 429 || res.status >= 500 });
    }
  }
  const fin = await apiFetch(`${API}/media/upload/${mediaId}/finalize`, { platform: "x", method: "POST", headers: { Authorization: `Bearer ${token}` } });
  let info = fin.body?.data?.processing_info || fin.body?.processing_info;
  const started = Date.now();
  while (info && info.state && !["succeeded", "failed"].includes(info.state)) {
    if (Date.now() - started > 4 * 60 * 1000) throw new PublishError("x: media processing timed out", { platform: "x", retryable: true });
    await new Promise((r) => setTimeout(r, Math.max(1000, (info.check_after_secs || 2) * 1000)));
    const st = await apiFetch(`${API}/media/upload?command=STATUS&media_id=${mediaId}`, { platform: "x", headers: { Authorization: `Bearer ${token}` } });
    info = st.body?.data?.processing_info || st.body?.processing_info || {};
  }
  if (info?.state === "failed") throw new PublishError(`x: media processing failed ${info.error?.message || ""}`, { platform: "x" });
  return mediaId;
}

const x = {
  id: "x",
  label: "X",
  appKey: "x",
  scopes: SCOPES,
  pkce: true,

  authUrl({ app, redirectUri, state, codeChallenge }) {
    const p = new URLSearchParams({
      response_type: "code",
      client_id: app.clientId,
      redirect_uri: redirectUri,
      scope: SCOPES.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `https://x.com/i/oauth2/authorize?${p}`;
  },

  async exchangeCode({ app, redirectUri, code, codeVerifier }) {
    const { body } = await apiFetch(`${API}/oauth2/token`, {
      platform: "x",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basic(app) },
      body: formBody({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: codeVerifier, client_id: app.clientId }),
    });
    const u = await me(body.access_token);
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token || null,
      expiresAt: new Date(Date.now() + (body.expires_in || 7200) * 1000),
      scopes: String(body.scope || "").split(" ").filter(Boolean),
      accounts: [{ externalId: u.id, handle: u.username, displayName: u.name, avatarUrl: u.profile_image_url || null, config: { username: u.username } }],
    };
  },

  /** X rotates refresh tokens: the returned one must replace the stored one. */
  async refresh({ app, refreshToken }) {
    const { body } = await apiFetch(`${API}/oauth2/token`, {
      platform: "x",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basic(app) },
      body: formBody({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: app.clientId }),
    });
    return { accessToken: body.access_token, refreshToken: body.refresh_token || null, expiresAt: new Date(Date.now() + (body.expires_in || 7200) * 1000) };
  },

  async probe({ token }) {
    try {
      const u = await me(token);
      return { ok: true, handle: u.username };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  async publishVideo({ channel, token, videoUrl, target }) {
    const bytes = await readAll(videoUrl);
    const mediaId = await uploadMedia(token, bytes, { mediaType: "video/mp4", category: "tweet_video" });
    return this.tweet({ channel, token, target, mediaId });
  },

  async publishImage({ channel, token, imageUrl, target }) {
    const bytes = await readAll(imageUrl);
    const mediaId = await uploadMedia(token, bytes, { mediaType: "image/jpeg", category: "tweet_image" });
    return this.tweet({ channel, token, target, mediaId });
  },

  async tweet({ channel, token, target, mediaId }) {
    const text = (target.caption || "").slice(0, 280);
    const { body } = await apiFetch(`${API}/tweets`, {
      platform: "x",
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, media: { media_ids: [String(mediaId)] } }),
    });
    const id = body?.data?.id;
    if (!id) throw new PublishError("x: tweet created without id", { platform: "x", body });
    const handle = channel.handle || channel.config?.username || "i";
    console.log("[X] posted", id);
    return { externalId: id, url: `https://x.com/${handle}/status/${id}`, pending: false, providerState: { mediaId, tweetId: id } };
  },

  async fetchStatus({ target }) {
    return target.externalId ? { status: "published", externalId: target.externalId, url: target.url } : { status: "failed", error: "no tweet id" };
  },
};

export default x;
