/**
 * Public-post fetchers per platform. Each returns
 * { profile: { externalId, displayName, url, followers }, posts: [{ externalId, url, caption, mediaType, thumbnailUrl, postedAt, likes, comments, shares, views, durationSec }] }
 * or throws with a readable message.
 */

function iso8601ToSec(d) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d || "");
  if (!m) return null;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

/** YouTube Data API v3 with a plain API key (free, 10k units/day). */
export async function fetchYouTube(handle) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not configured");
  const h = handle.replace(/^@/, "");
  const base = "https://www.googleapis.com/youtube/v3";
  let ch = await fetch(`${base}/channels?part=snippet,contentDetails,statistics&forHandle=${encodeURIComponent(h)}&key=${key}`).then((r) => r.json());
  if (!ch.items?.length) {
    ch = await fetch(`${base}/channels?part=snippet,contentDetails,statistics&forUsername=${encodeURIComponent(h)}&key=${key}`).then((r) => r.json());
  }
  if (ch.error) throw new Error(`YouTube: ${ch.error.message}`);
  const c = ch.items?.[0];
  if (!c) throw new Error(`YouTube channel @${h} not found`);
  const uploads = c.contentDetails?.relatedPlaylists?.uploads;
  const items = await fetch(`${base}/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=30&key=${key}`).then((r) => r.json());
  if (items.error) throw new Error(`YouTube: ${items.error.message}`);
  const ids = (items.items || []).map((i) => i.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) return { profile: { externalId: c.id, displayName: c.snippet?.title, url: `https://youtube.com/@${h}`, followers: Number(c.statistics?.subscriberCount || 0) }, posts: [] };
  const vids = await fetch(`${base}/videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}&key=${key}`).then((r) => r.json());
  if (vids.error) throw new Error(`YouTube: ${vids.error.message}`);
  const posts = (vids.items || []).map((v) => {
    const sec = iso8601ToSec(v.contentDetails?.duration);
    return {
      externalId: v.id,
      url: sec != null && sec <= 180 ? `https://youtube.com/shorts/${v.id}` : `https://youtube.com/watch?v=${v.id}`,
      caption: [v.snippet?.title, v.snippet?.description].filter(Boolean).join("\n").slice(0, 2000),
      mediaType: sec != null && sec <= 180 ? "short" : "video",
      thumbnailUrl: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || null,
      postedAt: v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : null,
      likes: Number(v.statistics?.likeCount || 0),
      comments: Number(v.statistics?.commentCount || 0),
      shares: 0,
      views: Number(v.statistics?.viewCount || 0),
      durationSec: sec,
    };
  });
  return { profile: { externalId: c.id, displayName: c.snippet?.title, url: `https://youtube.com/@${h}`, followers: Number(c.statistics?.subscriberCount || 0) }, posts };
}

/** X API v2 with an app bearer token (pay-per-use reads, about $0.005 each). */
export async function fetchX(handle) {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) throw new Error("X_BEARER_TOKEN is not configured");
  const h = handle.replace(/^@/, "");
  const headers = { Authorization: `Bearer ${token}` };
  const u = await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(h)}?user.fields=public_metrics,profile_image_url`, { headers }).then((r) => r.json());
  if (u.errors?.length || !u.data) throw new Error(`X: ${u.errors?.[0]?.detail || u.title || `@${h} not found`}`);
  const t = await fetch(`https://api.x.com/2/users/${u.data.id}/tweets?max_results=50&exclude=replies,retweets&tweet.fields=public_metrics,created_at,attachments&expansions=attachments.media_keys&media.fields=type,preview_image_url,url,duration_ms`, { headers }).then((r) => r.json());
  if (t.errors?.length && !t.data) throw new Error(`X: ${t.errors[0].detail || t.errors[0].title}`);
  const media = Object.fromEntries((t.includes?.media || []).map((m) => [m.media_key, m]));
  const posts = (t.data || []).map((tw) => {
    const mk = tw.attachments?.media_keys?.[0];
    const m = mk ? media[mk] : null;
    const pm = tw.public_metrics || {};
    return {
      externalId: tw.id,
      url: `https://x.com/${h}/status/${tw.id}`,
      caption: tw.text,
      mediaType: m?.type || "text",
      thumbnailUrl: m?.preview_image_url || m?.url || null,
      postedAt: tw.created_at ? new Date(tw.created_at) : null,
      likes: pm.like_count || 0,
      comments: pm.reply_count || 0,
      shares: (pm.retweet_count || 0) + (pm.quote_count || 0),
      views: pm.impression_count || 0,
      durationSec: m?.duration_ms ? Math.round(m.duration_ms / 1000) : null,
    };
  });
  return { profile: { externalId: u.data.id, displayName: u.data.name, url: `https://x.com/${h}`, followers: u.data.public_metrics?.followers_count || 0 }, posts };
}

/**
 * Instagram "business discovery": public data of any professional account,
 * read through one of our own connected Instagram channels (needs M4).
 */
export async function fetchInstagram(handle, { igUserId, accessToken } = {}) {
  if (!igUserId || !accessToken) throw new Error("Connect an Instagram channel first; competitor reads go through it");
  const h = handle.replace(/^@/, "");
  const fields = `business_discovery.username(${h}){id,username,name,followers_count,media.limit(30){id,caption,like_count,comments_count,media_type,media_url,thumbnail_url,permalink,timestamp}}`;
  const res = await fetch(`https://graph.facebook.com/v25.0/${igUserId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`).then((r) => r.json());
  if (res.error) throw new Error(`Instagram: ${res.error.message}`);
  const bd = res.business_discovery;
  if (!bd) throw new Error(`Instagram @${h} not found or not a professional account`);
  const posts = (bd.media?.data || []).map((m) => ({
    externalId: m.id,
    url: m.permalink,
    caption: m.caption || "",
    mediaType: (m.media_type || "").toLowerCase(),
    thumbnailUrl: m.thumbnail_url || m.media_url || null,
    postedAt: m.timestamp ? new Date(m.timestamp) : null,
    likes: m.like_count || 0,
    comments: m.comments_count || 0,
    shares: 0,
    views: 0,
    durationSec: null,
  }));
  return { profile: { externalId: bd.id, displayName: bd.name || bd.username, url: `https://instagram.com/${h}`, followers: bd.followers_count || 0 }, posts };
}

export const FETCHERS = {
  youtube: { fn: (handle) => fetchYouTube(handle), needs: "YOUTUBE_API_KEY (free Google API key)" },
  x: { fn: (handle) => fetchX(handle), needs: "X_BEARER_TOKEN (pay-per-use reads)" },
  instagram: { fn: (handle, ctx) => fetchInstagram(handle, ctx), needs: "a connected Instagram channel" },
  tiktok: { fn: null, needs: "no public API; add posts manually" },
  pinterest: { fn: null, needs: "no public API; add posts manually" },
  facebook: { fn: null, needs: "no public API; add posts manually" },
};
