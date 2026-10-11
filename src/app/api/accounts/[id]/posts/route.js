import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownedBrand as owned } from "@/lib/accounts";

const SELECT = { id: true, channelId: true, platform: true, externalId: true, url: true, caption: true, mediaType: true, thumbnailUrl: true, mediaUrls: true, postedAt: true, source: true, likes: true, comments: true, shares: true, saves: true, views: true, reach: true, impressions: true, clicks: true, engagementRate: true, reachRate: true, score: true, scoreBreakdown: true, format: true, topics: true, hashtags: true, analyzedAt: true, metricsUpdatedAt: true, analysis: true };

/** GET ?platform=&format=&minScore=&maxScore=&from=&to=&q=&sort=score|date|er|reach&page=&limit= */
export async function GET(req, { params }) {
  const { id } = await params;
  const { actor } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  const q = new URL(req.url).searchParams;
  const where = { actorId: id };
  if (q.get("platform")) where.platform = q.get("platform");
  if (q.get("format")) where.OR = [{ format: q.get("format") }, { mediaType: q.get("format") }];
  if (q.get("minScore") || q.get("maxScore")) where.score = { ...(q.get("minScore") ? { gte: Number(q.get("minScore")) } : {}), ...(q.get("maxScore") ? { lte: Number(q.get("maxScore")) } : {}) };
  if (q.get("from") || q.get("to")) where.postedAt = { ...(q.get("from") ? { gte: new Date(q.get("from")) } : {}), ...(q.get("to") ? { lte: new Date(`${q.get("to")}T23:59:59Z`) } : {}) };
  if (q.get("q")) where.caption = { contains: q.get("q"), mode: "insensitive" };
  const sort = q.get("sort") || "score";
  const orderBy = sort === "date" ? [{ postedAt: "desc" }] : sort === "er" ? [{ engagementRate: { sort: "desc", nulls: "last" } }] : sort === "reach" ? [{ reach: { sort: "desc", nulls: "last" } }] : [{ score: { sort: "desc", nulls: "last" } }, { postedAt: "desc" }];
  const limit = Math.min(100, Math.max(1, Number(q.get("limit")) || 48));
  const page = Math.max(1, Number(q.get("page")) || 1);
  const [items, total] = await Promise.all([
    prisma.channelPost.findMany({ where, orderBy, take: limit, skip: (page - 1) * limit, select: SELECT }),
    prisma.channelPost.count({ where }),
  ]);
  const formats = await prisma.channelPost.groupBy({ by: ["mediaType"], where: { actorId: id }, _count: { _all: true } });
  return NextResponse.json({ items, total, page, limit, formats: formats.map((f) => ({ key: f.mediaType, n: f._count._all })) });
}
