import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { generateStructured, usageCents } from "@/lib/content/claude";
import { ScreenshotPostSchema } from "@/lib/content/schemas";
import { logEvent } from "@/lib/scheduler/status";
import { rescorePlatform } from "./sync";

/** Stable id for a post we only know from a screenshot or a transcription. */
export function screenshotExternalId(platform, postedAt, caption) {
  const when = postedAt ? new Date(postedAt).toISOString().slice(0, 16) : "";
  const head = String(caption || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 60);
  return `ss_${createHash("sha1").update(`${platform}|${when}|${head}`).digest("hex").slice(0, 20)}`;
}

const MEDIA = { graphic: "image", text: "text", link: "link", image: "image", carousel: "carousel", video: "video", reel: "reel" };

/**
 * Record posts transcribed from screenshots (by Claude in-app, by Claude.ai
 * through the MCP connector, or by the seed). Each post:
 *   { platform, postedAt, caption, likes, comments, shares, views?, mediaType?, format?, thumbnailUrl?, mediaUrls?, overlayText?, mediaDescription?, source? }
 * Re-running with the same post updates the counts and appends a metric snapshot.
 */
export async function recordPosts(actorId, posts, { source = "screenshot", defaultPlatform = "facebook" } = {}) {
  // Posts by members of the brand's own group are community benchmarks, not the brand's posts.
  const members = posts.filter((p) => p.author === "member");
  let community = { recorded: 0 };
  if (members.length) {
    const { recordCommunityPosts } = await import("./community");
    community = await recordCommunityPosts(actorId, members.map((p) => ({ ...p, platform: "facebook_group" })));
    posts = posts.filter((p) => p.author !== "member");
  }
  const touched = [];
  const platforms = new Set();
  for (const p of posts) {
    const platform = ["facebook", "facebook_group", "instagram", "tiktok", "x", "youtube"].includes(p.platform) ? p.platform : defaultPlatform;
    const postedAt = p.postedAt ? new Date(p.postedAt) : null;
    if (postedAt && Number.isNaN(postedAt.getTime())) continue;
    const externalId = p.externalId || screenshotExternalId(platform, postedAt, p.caption);
    const counts = { likes: Math.max(0, Math.round(Number(p.likes) || 0)), comments: Math.max(0, Math.round(Number(p.comments) || 0)), shares: Math.max(0, Math.round(Number(p.shares) || 0)), views: Math.max(0, Math.round(Number(p.views) || 0)) };
    const mediaType = MEDIA[p.mediaType] || "image";
    const raw = { format: p.format || null, overlayText: p.overlayText || null, mediaDescription: p.mediaDescription || null, dateText: p.dateText || null, brandReplied: Boolean(p.brandReplied), captionTruncated: Boolean(p.captionTruncated) };
    const hashtags = Array.from(String(p.caption || "").matchAll(/#([\p{L}\p{N}_]+)/gu)).map((m) => m[1].toLowerCase());
    const row = await prisma.channelPost.upsert({
      where: { actorId_platform_externalId: { actorId, platform, externalId } },
      create: { actorId, platform, externalId, source, caption: p.caption || "", mediaType, format: p.format || null, mediaUrls: Array.isArray(p.mediaUrls) ? p.mediaUrls : [], thumbnailUrl: p.thumbnailUrl || null, postedAt, ...counts, hashtags: Array.from(new Set(hashtags)).slice(0, 30), raw, fetchedAt: new Date(), metricsUpdatedAt: new Date() },
      update: { ...counts, caption: p.caption || undefined, format: p.format || undefined, thumbnailUrl: p.thumbnailUrl || undefined, raw, fetchedAt: new Date(), metricsUpdatedAt: new Date() },
    });
    await prisma.channelPostMetric.create({ data: { channelPostId: row.id, ...counts, reach: null } });
    touched.push(row.id);
    platforms.add(platform);
  }
  for (const platform of platforms) await rescorePlatform(actorId, platform);
  return { ids: touched, platforms: Array.from(platforms), community: community.recorded };
}

const SYSTEM = `You transcribe social media post screenshots into structured data for an analytics tool. If the header names a Facebook *group* (e.g. "APEX Outdoor Rewards Group") the platform is facebook_group; if the poster is shown as "Group member" or an individual person rather than the page/brand, author is "member", otherwise "brand". Read every visible number exactly (reactions/likes, comments, shares, views). Copy the caption verbatim including emojis and hashtags. A screenshot may contain more than one post; return each. Dates: use the year rule in the schema. Output only the requested JSON.`;

/** Claude vision over one screenshot URL → array of transcribed posts. */
export async function extractFromScreenshot(url, { today = new Date(), defaultPlatform = "facebook" } = {}) {
  const user = [
    { type: "text", text: `Today is ${today.toISOString().slice(0, 10)}. Default platform if unclear: ${defaultPlatform}. Transcribe every post in this screenshot.` },
    { type: "image", source: { type: "url", url } },
  ];
  const { data, usage } = await generateStructured({ system: SYSTEM, user, schema: ScreenshotPostSchema, effort: "low", maxTokens: 4000 });
  return { posts: data.posts.map((p) => ({ ...p, platform: p.platform === "unknown" ? defaultPlatform : p.platform, thumbnailUrl: url })), costCents: usageCents(usage) };
}

/** Upload path: screenshots → Claude → ChannelPost rows (+ score). */
export async function importScreenshots(actorId, urls, { defaultPlatform = "facebook" } = {}) {
  const all = [];
  let costCents = 0;
  const errors = [];
  for (const url of urls) {
    try {
      const r = await extractFromScreenshot(url, { defaultPlatform });
      all.push(...r.posts);
      costCents += r.costCents;
    } catch (err) {
      errors.push({ url, error: String(err?.message || err) });
    }
  }
  const { ids, platforms } = await recordPosts(actorId, all, { source: "screenshot", defaultPlatform });
  await logEvent({ actorId, kind: "import", step: "screenshots", costCents, message: `${ids.length} posts from ${urls.length} screenshots`, data: { errors } });
  return { posts: ids.length, platforms, errors, costCents };
}
