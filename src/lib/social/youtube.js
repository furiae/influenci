import { apiFetch, formBody } from "./http";
import { PublishError } from "./contract";
import { readAll } from "./range";

const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];
const API = "https://www.googleapis.com/youtube/v3";

async function myChannel(token) {
  const { body } = await apiFetch(`${API}/channels?part=snippet,contentDetails,statistics&mine=true`, {
    platform: "youtube",
    headers: { Authorization: `Bearer ${token}` },
  });
  const c = body.items?.[0];
  if (!c) throw new PublishError("youtube: no channel on this Google account (create a YouTube channel first)", { platform: "youtube" });
  return c;
}

const youtube = {
  id: "youtube",
  label: "YouTube",
  appKey: "youtube",
  scopes: SCOPES,
  pkce: false,

  authUrl({ app, redirectUri, state }) {
    const p = new URLSearchParams({
      client_id: app.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  },

  async exchangeCode({ app, redirectUri, code }) {
    const { body } = await apiFetch("https://oauth2.googleapis.com/token", {
      platform: "youtube",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ grant_type: "authorization_code", code, client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: redirectUri }),
    });
    const c = await myChannel(body.access_token);
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token || null,
      expiresAt: new Date(Date.now() + (body.expires_in || 3600) * 1000),
      scopes: String(body.scope || "").split(" ").filter(Boolean),
      accounts: [{
        externalId: c.id,
        handle: c.snippet?.customUrl?.replace(/^@/, "") || null,
        displayName: c.snippet?.title,
        avatarUrl: c.snippet?.thumbnails?.default?.url || null,
        config: { channelId: c.id, uploadsPlaylistId: c.contentDetails?.relatedPlaylists?.uploads || null, subscribers: Number(c.statistics?.subscriberCount || 0), defaultCategoryId: "22" },
      }],
    };
  },

  async refresh({ app, refreshToken }) {
    const { body } = await apiFetch("https://oauth2.googleapis.com/token", {
      platform: "youtube",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: app.clientId, client_secret: app.clientSecret }),
    });
    return { accessToken: body.access_token, expiresAt: new Date(Date.now() + (body.expires_in || 3600) * 1000) };
  },

  async probe({ token }) {
    try {
      const c = await myChannel(token);
      return { ok: true, handle: c.snippet?.customUrl?.replace(/^@/, "") || c.snippet?.title };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  /** Resumable upload in one PUT (our clips are tens of MB at most). */
  async publishVideo({ token, videoUrl, videoMeta = {}, target, post }) {
    const title = (target.title || post.hook || post.idea || "New video").slice(0, 100);
    const description = (target.caption || "").slice(0, 5000);
    const tags = (target.hashtags || []).map((h) => h.replace(/^#/, "")).slice(0, 15);
    const settings = target.settings || {};
    const bytes = await readAll(videoUrl);
    const metadata = {
      snippet: { title, description, tags, categoryId: settings.categoryId || "22" },
      status: {
        privacyStatus: settings.privacyStatus || "public",
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: true,
        ...(settings.publishAt ? { publishAt: settings.publishAt, privacyStatus: "private" } : {}),
      },
    };
    const init = await fetch(`https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=${settings.notifySubscribers === false ? "false" : "true"}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(bytes.length),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify(metadata),
    });
    if (!init.ok) {
      const t = await init.text();
      throw new PublishError(`youtube: upload init ${init.status} ${t.slice(0, 300)}`, { platform: "youtube", status: init.status, retryable: init.status === 429 || init.status >= 500, body: t });
    }
    const uploadUri = init.headers.get("location");
    if (!uploadUri) throw new PublishError("youtube: no upload URI returned", { platform: "youtube" });
    const put = await fetch(uploadUri, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes.length) }, body: bytes });
    const text = await put.text();
    if (!(put.status === 200 || put.status === 201)) {
      throw new PublishError(`youtube: upload ${put.status} ${text.slice(0, 300)}`, { platform: "youtube", status: put.status, retryable: put.status === 429 || put.status >= 500, body: text });
    }
    const json = JSON.parse(text);
    const id = json.id;
    const short = (videoMeta.durationSec || 0) <= 180;
    console.log("[YOUTUBE] uploaded", id);
    return { externalId: id, url: short ? `https://youtube.com/shorts/${id}` : `https://youtube.com/watch?v=${id}`, pending: false, providerState: { videoId: id } };
  },

  async fetchStatus({ token, target }) {
    const id = target.externalId || target.providerState?.videoId;
    if (!id) return { status: "failed", error: "no video id" };
    const { body } = await apiFetch(`${API}/videos?part=status,processingDetails&id=${id}`, { platform: "youtube", headers: { Authorization: `Bearer ${token}` } });
    const v = body.items?.[0];
    if (!v) return { status: "failed", error: "video not found (deleted?)" };
    const up = v.status?.uploadStatus;
    if (up === "rejected" || up === "failed") return { status: "failed", error: v.status?.rejectionReason || v.status?.failureReason || up };
    return { status: "published", externalId: id, url: target.url };
  },
};

export default youtube;
