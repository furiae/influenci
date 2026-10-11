import { prisma } from "@/lib/prisma";
import { generateStructured, usageCents } from "@/lib/content/claude";
import { PostAnalysisSchema } from "@/lib/content/schemas";
import { logEvent } from "@/lib/scheduler/status";

const SYSTEM = `You analyse a brand's own social media post (image or video thumbnail + caption + metrics) so the brand can learn what works. Be concrete and visual: name the subject, the composition, the colours, the text overlay, the caption pattern and the call to action. Judge "why it works" against the engagement numbers you are given, not in the abstract. Output only the requested JSON.`;

function imageBlock(url) {
  return url && /^https?:\/\//.test(url) ? [{ type: "image", source: { type: "url", url } }] : [];
}

/**
 * Claude-vision analysis of one ChannelPost. Stores analysis/topics/format and
 * returns the analysis. Safe to call again (overwrites).
 */
export async function analyzeChannelPost(postId) {
  const p = await prisma.channelPost.findUnique({ where: { id: postId }, include: { channel: { select: { followers: true, handle: true } } } });
  if (!p) throw new Error("Post not found");
  const metrics = `likes ${p.likes}, comments ${p.comments}, shares ${p.shares}, saves ${p.saves}, views ${p.views}, reach ${p.reach ?? "unknown"}, followers ${p.followersAtFetch ?? p.channel?.followers ?? "unknown"}${p.score ? `, our score ${p.score}/10` : ""}`;
  const user = [
    { type: "text", text: `${p.platform} ${p.mediaType || "post"} by @${p.channel?.handle || "brand"}, posted ${p.postedAt ? new Date(p.postedAt).toDateString() : "(unknown date)"}.\nMetrics: ${metrics}\nCaption:\n${(p.caption || "(no caption)").slice(0, 1500)}\n\nImage:` },
    ...imageBlock(p.thumbnailUrl || p.mediaUrls?.[0]),
    { type: "text", text: "Analyse this post." },
  ];
  const { data, usage } = await generateStructured({ system: SYSTEM, user, schema: PostAnalysisSchema, effort: "low", maxTokens: 2500 });
  const hashtags = Array.from(String(p.caption || "").matchAll(/#([\p{L}\p{N}_]+)/gu)).map((m) => m[1].toLowerCase());
  await prisma.channelPost.update({
    where: { id: postId },
    data: { analysis: data, analyzedAt: new Date(), topics: data.topics.slice(0, 5), format: data.format, hashtags: Array.from(new Set(hashtags)).slice(0, 30) },
  });
  await logEvent({ actorId: p.actorId, kind: "insights", step: "analyze_post", costCents: usageCents(usage), message: p.externalId, data: { format: data.format } });
  return data;
}

/** Analyse up to `limit` posts without analysis, best-scoring first. */
export async function analyzePending(actorId, { limit = 5 } = {}) {
  const todo = await prisma.channelPost.findMany({ where: { actorId, analyzedAt: null, OR: [{ thumbnailUrl: { not: null } }, { caption: { not: null } }] }, orderBy: [{ score: "desc" }, { postedAt: "desc" }], take: limit, select: { id: true } });
  const out = [];
  for (const p of todo) {
    try {
      out.push({ id: p.id, format: (await analyzeChannelPost(p.id)).format });
    } catch (err) {
      out.push({ id: p.id, error: String(err?.message || err) });
    }
  }
  return out;
}
