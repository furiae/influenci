import { apiFetch, formBody } from "./http";
import { PublishError } from "./contract";
import { encrypt, decrypt } from "@/lib/crypto";

/**
 * Meta connector (Facebook Pages + Instagram professional accounts) through
 * Facebook Login for Business. One login returns every Page the user manages;
 * each Page carries its own never-expiring Page token (derived from a
 * long-lived user token), and the Instagram account linked to the Page is
 * read and published through that same Page token.
 *
 * Exported as two connectors ("facebook", "instagram") that share the flow.
 */
export const GRAPH = "https://graph.facebook.com/v25.0";

export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_manage_posts",
  "pages_manage_engagement",
  "read_insights",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "instagram_manage_comments",
];

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80003, 80004, 80005, 80006]);

/** Graph API call: JSON in/out, retryable on throttling. */
export async function graph(path, { token, method = "GET", params = {}, platform = "meta", form } = {}) {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  if (token && method === "GET") url.searchParams.set("access_token", token);
  const opts = { platform, method };
  if (method !== "GET") {
    opts.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    opts.body = formBody({ ...(form || {}), access_token: token });
  }
  try {
    const { body } = await apiFetch(url.toString(), opts);
    return body;
  } catch (err) {
    if (err instanceof PublishError && RATE_LIMIT_CODES.has(Number(err.code))) err.retryable = true;
    throw err;
  }
}

export function isPermissionError(err) {
  return err?.status === 400 && (Number(err.code) === 10 || Number(err.code) === 200 || /permission/i.test(err.message || ""));
}

/* ---------- OAuth ---------- */

function authUrl({ app, redirectUri, state }) {
  const p = new URLSearchParams({ client_id: app.clientId, redirect_uri: redirectUri, state, response_type: "code" });
  const configId = app.extra?.configId;
  if (configId) p.set("config_id", String(configId));
  else p.set("scope", META_SCOPES.join(","));
  return `https://www.facebook.com/v25.0/dialog/oauth?${p}`;
}

async function exchangeCode({ app, redirectUri, code }) {
  const short = await graph("oauth/access_token", { params: { client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: redirectUri, code } });
  const long = await graph("oauth/access_token", {
    params: { grant_type: "fb_exchange_token", client_id: app.clientId, client_secret: app.clientSecret, fb_exchange_token: short.access_token },
  }).catch(() => short);
  const userToken = long.access_token || short.access_token;
  const userExpiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null;

  const me = await graph("me", { token: userToken, params: { fields: "id,name" } });
  const pages = [];
  let next = `${GRAPH}/me/accounts?fields=id,name,username,access_token,picture{url},fan_count,followers_count,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}&limit=50`;
  while (next) {
    const page = await graph(next, { token: userToken });
    pages.push(...(page.data || []));
    next = page.paging?.next || null;
  }
  if (!pages.length) throw new PublishError("meta: this Facebook login manages no Pages. Make sure you are an admin of the brand's Page and granted access to it.", { platform: "meta" });

  const available = pages.map((p) => ({
    pageId: p.id,
    name: p.name,
    username: p.username || null,
    igUserId: p.instagram_business_account?.id || null,
    igUsername: p.instagram_business_account?.username || null,
    tokenEnc: encrypt(p.access_token),
  }));
  const shared = { user: { id: me.id, name: me.name }, userTokenEnc: encrypt(userToken), userTokenExpiresAt: userExpiresAt, availablePages: available.map(({ tokenEnc, ...rest }) => rest) };
  const grantedScopes = await graph("me/permissions", { token: userToken }).then((r) => (r.data || []).filter((x) => x.status === "granted").map((x) => x.permission)).catch(() => META_SCOPES);

  const first = pages[0];
  return {
    accessToken: first.access_token,
    refreshToken: null,
    expiresAt: null,
    scopes: grantedScopes,
    accounts: accountsForPage(first, { ...shared, pagesWithTokens: available }),
  };
}

/** Channel account entries (facebook + instagram) for one Page. */
export function accountsForPage(p, shared) {
  const base = { ...shared, pageId: p.id, pageName: p.name };
  const out = [
    {
      platform: "facebook",
      externalId: p.id,
      handle: p.username || p.name,
      displayName: p.name,
      avatarUrl: p.picture?.data?.url || null,
      accessToken: p.access_token,
      expiresAt: null,
      config: { ...base, followers: p.followers_count ?? p.fan_count ?? null },
    },
  ];
  const ig = p.instagram_business_account;
  if (ig?.id) {
    out.push({
      platform: "instagram",
      externalId: ig.id,
      handle: ig.username,
      displayName: ig.name || ig.username,
      avatarUrl: ig.profile_picture_url || null,
      accessToken: p.access_token,
      expiresAt: null,
      config: { ...base, igUserId: ig.id, followers: ig.followers_count ?? null, mediaCount: ig.media_count ?? null },
    });
  }
  return out;
}

/** Re-point a channel pair to another Page from the same login (stored encrypted in config.pagesWithTokens). */
export async function pageFromConfig(config, pageId) {
  const entry = (config?.pagesWithTokens || []).find((p) => p.pageId === pageId);
  if (!entry) return null;
  const token = decrypt(entry.tokenEnc);
  const p = await graph(pageId, { token, params: { fields: "id,name,username,picture{url},fan_count,followers_count,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}" } });
  return { ...p, access_token: token };
}

/* ---------- Reads ---------- */

async function probeFacebook({ channel, token }) {
  try {
    const p = await graph(channel.externalId, { token, params: { fields: "id,name,username,fan_count,followers_count" } });
    return { ok: true, handle: p.username || p.name, followers: p.followers_count ?? p.fan_count ?? null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function probeInstagram({ channel, token }) {
  try {
    const p = await graph(channel.externalId, { token, params: { fields: "id,username,name,followers_count,follows_count,media_count" } });
    return { ok: true, handle: p.username, followers: p.followers_count ?? null, following: p.follows_count ?? null, mediaCount: p.media_count ?? null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

const IG_MEDIA_FIELDS = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{id,media_type,media_url,thumbnail_url}";

function igMediaType(m) {
  if (m.media_product_type === "REELS") return "reel";
  if (m.media_product_type === "STORY") return "story";
  if (m.media_type === "CAROUSEL_ALBUM") return "carousel";
  if (m.media_type === "VIDEO") return "video";
  return "image";
}

async function listInstagramPosts({ channel, token, cursor, since }) {
  const params = { fields: IG_MEDIA_FIELDS, limit: 50 };
  if (cursor) params.after = cursor;
  if (since) params.since = Math.floor(new Date(since).getTime() / 1000);
  const res = await graph(`${channel.externalId}/media`, { token, params, platform: "instagram" });
  const posts = (res.data || []).map((m) => ({
    externalId: m.id,
    url: m.permalink,
    caption: m.caption || "",
    mediaType: igMediaType(m),
    mediaUrls: m.children?.data?.length ? m.children.data.map((c) => c.media_url || c.thumbnail_url).filter(Boolean) : [m.media_url || m.thumbnail_url].filter(Boolean),
    thumbnailUrl: m.thumbnail_url || (m.media_type === "VIDEO" ? null : m.media_url) || m.children?.data?.[0]?.media_url || null,
    postedAt: m.timestamp ? new Date(m.timestamp) : null,
    likes: m.like_count || 0,
    comments: m.comments_count || 0,
    shares: 0,
    views: 0,
    raw: { media_type: m.media_type, media_product_type: m.media_product_type },
  }));
  return { posts, nextCursor: res.paging?.cursors?.after && res.paging?.next ? res.paging.cursors.after : null };
}

const FB_POST_FIELDS = "id,message,story,created_time,permalink_url,full_picture,status_type,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),attachments{media_type,type,url,media,subattachments{media_type,media,url}}";

function fbMediaType(p) {
  const a = p.attachments?.data?.[0];
  const t = a?.media_type || a?.type || "";
  if (/album/i.test(t) || a?.subattachments?.data?.length > 1) return "carousel";
  if (/video/i.test(t) || /video/i.test(p.status_type || "")) return "video";
  if (/photo|image/i.test(t)) return "image";
  if (/share|link/i.test(t) || p.status_type === "shared_story") return "link";
  return p.full_picture ? "image" : "text";
}

async function listFacebookPosts({ channel, token, cursor, since }) {
  const params = { fields: FB_POST_FIELDS, limit: 50 };
  if (cursor) params.after = cursor;
  if (since) params.since = Math.floor(new Date(since).getTime() / 1000);
  let res;
  try {
    res = await graph(`${channel.externalId}/published_posts`, { token, params, platform: "facebook" });
  } catch (err) {
    if (!isPermissionError(err)) throw err;
    res = await graph(`${channel.externalId}/posts`, { token, params, platform: "facebook" });
  }
  const posts = (res.data || []).map((p) => {
    const subs = p.attachments?.data?.[0]?.subattachments?.data || [];
    const mediaUrls = subs.length ? subs.map((s) => s.media?.image?.src).filter(Boolean) : [p.full_picture].filter(Boolean);
    return {
      externalId: p.id,
      url: p.permalink_url || `https://www.facebook.com/${p.id}`,
      caption: p.message || p.story || "",
      mediaType: fbMediaType(p),
      mediaUrls,
      thumbnailUrl: p.full_picture || null,
      postedAt: p.created_time ? new Date(p.created_time) : null,
      likes: p.reactions?.summary?.total_count || 0,
      comments: p.comments?.summary?.total_count || 0,
      shares: p.shares?.count || 0,
      views: 0,
      raw: { status_type: p.status_type, attachment: p.attachments?.data?.[0]?.media_type || p.attachments?.data?.[0]?.type || null },
    };
  });
  return { posts, nextCursor: res.paging?.cursors?.after && res.paging?.next ? res.paging.cursors.after : null };
}

/** Metric names Meta rejected on this process; never asked for again. */
const UNSUPPORTED = new Set();

/**
 * Ask for a metric list; when Meta rejects the list (renamed/retired metric),
 * fall back to one request per metric and remember what failed.
 */
async function insightsTolerant(path, { token, metrics, params = {}, platform }) {
  const wanted = metrics.filter((m) => !UNSUPPORTED.has(`${platform}:${m}`));
  const out = {};
  if (!wanted.length) return out;
  const absorb = (res) => {
    for (const row of res.data || []) {
      const v = row.total_value?.value ?? row.values?.[row.values.length - 1]?.value ?? null;
      out[row.name] = v && typeof v === "object" ? v : Number(v ?? 0);
    }
  };
  try {
    absorb(await graph(path, { token, params: { ...params, metric: wanted.join(",") }, platform }));
    return out;
  } catch (err) {
    if (err.retryable) throw err;
    if (Number(err.code) === 100 && /not|invalid|unsupported|deprecated/i.test(err.message)) {
      for (const m of wanted) {
        try {
          absorb(await graph(path, { token, params: { ...params, metric: m }, platform }));
        } catch (e) {
          if (e.retryable) throw e;
          UNSUPPORTED.add(`${platform}:${m}`);
        }
      }
      return out;
    }
    throw err;
  }
}

const IG_FEED_METRICS = ["reach", "saved", "shares", "likes", "comments", "total_interactions", "views"];
const IG_REEL_METRICS = [...IG_FEED_METRICS, "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"];
const IG_STORY_METRICS = ["reach", "replies", "views", "shares"];

async function fetchInstagramPostMetrics({ token, post }) {
  const type = post.mediaType;
  const metrics = type === "reel" ? IG_REEL_METRICS : type === "story" ? IG_STORY_METRICS : IG_FEED_METRICS;
  let m;
  try {
    m = await insightsTolerant(`${post.externalId}/insights`, { token, metrics, platform: "instagram" });
  } catch (err) {
    // Media created before the account became professional has no insights.
    if (!err.retryable && Number(err.code) === 100) return { unavailable: true, error: err.message };
    throw err;
  }
  return {
    reach: m.reach ?? null,
    saves: m.saved ?? 0,
    shares: m.shares ?? 0,
    views: m.views ?? 0,
    likes: m.likes ?? undefined,
    comments: m.comments ?? undefined,
    impressions: null,
    videoAvgWatchSec: m.ig_reels_avg_watch_time != null ? Number(m.ig_reels_avg_watch_time) / 1000 : null,
    raw: m,
  };
}

const FB_POST_METRICS = ["post_clicks", "post_reactions_by_type_total", "post_impressions_unique", "post_impressions", "post_total_media_view_unique", "post_media_view"];

async function fetchFacebookPostMetrics({ token, post }) {
  const m = await insightsTolerant(`${post.externalId}/insights`, { token, metrics: FB_POST_METRICS, platform: "facebook" });
  const reactions = m.post_reactions_by_type_total && typeof m.post_reactions_by_type_total === "object" ? m.post_reactions_by_type_total : null;
  return {
    reach: m.post_impressions_unique ?? m.post_total_media_view_unique ?? null,
    impressions: m.post_impressions ?? m.post_media_view ?? null,
    clicks: m.post_clicks ?? null,
    reactionsByType: reactions,
    raw: m,
  };
}

function ymd(d) {
  return new Date(d).toISOString().slice(0, 10);
}

async function fetchInstagramAccountInsights({ channel, token, since, until }) {
  const params = { period: "day", since: Math.floor(new Date(since).getTime() / 1000), until: Math.floor(new Date(until).getTime() / 1000) };
  const rows = {};
  const daily = await graph(`${channel.externalId}/insights`, { token, params: { ...params, metric: "reach,follower_count" }, platform: "instagram" }).catch(() => ({ data: [] }));
  for (const row of daily.data || []) {
    for (const v of row.values || []) {
      const day = ymd(v.end_time);
      rows[day] = rows[day] || { date: day, raw: {} };
      if (row.name === "reach") rows[day].reach = Number(v.value || 0);
      if (row.name === "follower_count") rows[day].newFollowers = Number(v.value || 0);
      rows[day].raw[row.name] = v.value;
    }
  }
  const totals = await graph(`${channel.externalId}/insights`, { token, params: { ...params, metric: "profile_views,website_clicks", metric_type: "total_value" }, platform: "instagram" }).catch(() => ({ data: [] }));
  const last = ymd(until);
  for (const row of totals.data || []) {
    rows[last] = rows[last] || { date: last, raw: {} };
    if (row.name === "profile_views") rows[last].profileViews = Number(row.total_value?.value || 0);
    if (row.name === "website_clicks") rows[last].websiteClicks = Number(row.total_value?.value || 0);
  }
  return Object.values(rows).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchFacebookAccountInsights({ channel, token, since, until }) {
  const params = { period: "day", since: Math.floor(new Date(since).getTime() / 1000), until: Math.floor(new Date(until).getTime() / 1000) };
  const rows = {};
  const absorb = (res) => {
    for (const row of res.data || []) {
      for (const v of row.values || []) {
        const day = ymd(v.end_time);
        rows[day] = rows[day] || { date: day, raw: {} };
        rows[day].raw[row.name] = v.value;
        if (row.name === "page_follows" || row.name === "page_fans") rows[day].followers = Number(v.value || 0);
        if (row.name === "page_daily_follows") rows[day].newFollowers = Number(v.value || 0);
        if (row.name === "page_impressions_unique" || row.name === "page_media_view_unique") rows[day].reach = Number(v.value || 0);
        if (row.name === "page_impressions" || row.name === "page_media_view") rows[day].impressions = Number(v.value || 0);
        if (row.name === "page_views_total") rows[day].profileViews = Number(v.value || 0);
      }
    }
  };
  for (const metric of ["page_follows", "page_daily_follows", "page_impressions_unique", "page_impressions", "page_views_total", "page_fans"]) {
    if (UNSUPPORTED.has(`facebook:${metric}`)) continue;
    try {
      absorb(await graph(`${channel.externalId}/insights`, { token, params: { ...params, metric }, platform: "facebook" }));
    } catch (err) {
      if (err.retryable) throw err;
      UNSUPPORTED.add(`facebook:${metric}`);
    }
  }
  return Object.values(rows).sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- Publishing ---------- */

async function igPublishContainer({ token, igUserId, form }) {
  const c = await graph(`${igUserId}/media`, { token, method: "POST", form, platform: "instagram" });
  return c.id;
}

async function igContainerStatus({ token, containerId }) {
  const s = await graph(containerId, { token, params: { fields: "status_code,status" }, platform: "instagram" });
  return s;
}

async function igPublishNow({ token, igUserId, containerId }) {
  const r = await graph(`${igUserId}/media_publish`, { token, method: "POST", form: { creation_id: containerId }, platform: "instagram" });
  const m = await graph(r.id, { token, params: { fields: "permalink" }, platform: "instagram" }).catch(() => ({}));
  return { externalId: r.id, url: m.permalink || null };
}

function igCaption(target) {
  return (target.caption || "").slice(0, 2200);
}

async function publishInstagramImage({ token, channel, imageUrl, target }) {
  const igUserId = channel.externalId;
  const containerId = await igPublishContainer({ token, igUserId, form: { image_url: imageUrl, caption: igCaption(target) } });
  const r = await igPublishNow({ token, igUserId, containerId });
  console.log("[INSTAGRAM] published image", r.externalId);
  return { ...r, pending: false, providerState: { containerId } };
}

async function publishInstagramVideo({ token, channel, videoUrl, coverUrl, target }) {
  const igUserId = channel.externalId;
  const containerId = await igPublishContainer({ token, igUserId, form: { media_type: "REELS", video_url: videoUrl, caption: igCaption(target), share_to_feed: "true", ...(coverUrl ? { cover_url: coverUrl } : {}) } });
  console.log("[INSTAGRAM] reel container", containerId);
  return { externalId: containerId, pending: true, providerState: { containerId, igUserId } };
}

async function fetchInstagramStatus({ token, channel, target }) {
  const containerId = target.providerState?.containerId;
  if (target.url && target.externalId && target.externalId !== containerId) return { status: "published", externalId: target.externalId, url: target.url };
  if (!containerId) return { status: "failed", error: "no container id" };
  const s = await igContainerStatus({ token, containerId });
  if (s.status_code === "ERROR" || s.status_code === "EXPIRED") return { status: "failed", error: s.status || s.status_code };
  if (s.status_code !== "FINISHED") return { status: "processing" };
  const r = await igPublishNow({ token, igUserId: channel.externalId, containerId });
  return { status: "published", externalId: r.externalId, url: r.url };
}

async function publishFacebookImage({ token, channel, imageUrl, target }) {
  const r = await graph(`${channel.externalId}/photos`, { token, method: "POST", form: { url: imageUrl, message: target.caption || "", published: "true" }, platform: "facebook" });
  const postId = r.post_id || r.id;
  console.log("[FACEBOOK] published photo", postId);
  return { externalId: postId, url: `https://www.facebook.com/${postId}`, pending: false, providerState: { photoId: r.id, postId } };
}

async function publishFacebookVideo({ token, channel, videoUrl, target, post }) {
  const r = await graph(`${channel.externalId}/videos`, { token, method: "POST", form: { file_url: videoUrl, description: target.caption || "", title: (target.title || post?.hook || "").slice(0, 100) }, platform: "facebook" });
  console.log("[FACEBOOK] video submitted", r.id);
  return { externalId: r.id, pending: true, providerState: { videoId: r.id } };
}

async function fetchFacebookStatus({ token, target }) {
  const videoId = target.providerState?.videoId;
  if (!videoId) return target.externalId ? { status: "published", externalId: target.externalId, url: target.url } : { status: "failed", error: "no id" };
  const v = await graph(videoId, { token, params: { fields: "status,permalink_url,post_id" }, platform: "facebook" });
  const st = v.status?.video_status;
  if (st === "error") return { status: "failed", error: v.status?.processing_phase?.errors?.[0]?.message || "video processing error" };
  if (st && st !== "ready") return { status: "processing" };
  return { status: "published", externalId: v.post_id || videoId, url: v.permalink_url ? `https://www.facebook.com${v.permalink_url}` : target.url };
}

/* ---------- Connectors ---------- */

const shared = { appKey: "meta", scopes: META_SCOPES, pkce: false, authUrl, exchangeCode, refresh: null };

export const facebook = {
  ...shared,
  id: "facebook",
  label: "Facebook",
  probe: probeFacebook,
  listPosts: listFacebookPosts,
  fetchPostMetrics: fetchFacebookPostMetrics,
  fetchAccountInsights: fetchFacebookAccountInsights,
  publishImage: publishFacebookImage,
  publishVideo: publishFacebookVideo,
  fetchStatus: fetchFacebookStatus,
};

export const instagram = {
  ...shared,
  id: "instagram",
  label: "Instagram",
  probe: probeInstagram,
  listPosts: listInstagramPosts,
  fetchPostMetrics: fetchInstagramPostMetrics,
  fetchAccountInsights: fetchInstagramAccountInsights,
  publishImage: publishInstagramImage,
  publishVideo: publishInstagramVideo,
  fetchStatus: fetchInstagramStatus,
};
