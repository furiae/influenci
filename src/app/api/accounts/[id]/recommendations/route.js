import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownedBrand as owned } from "@/lib/accounts";
import { recommendPosts, recommendLike } from "@/lib/insights/recommend";
import { serverAiEnabled, subscriptionHint } from "@/lib/content/ai-mode";

export const maxDuration = 300;

/** GET ?status=suggested|saved|dismissed|used */
export async function GET(req, { params }) {
  const { id } = await params;
  const { actor } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  const status = new URL(req.url).searchParams.get("status");
  const items = await prisma.recommendation.findMany({ where: { actorId: id, ...(status ? { status } : { status: { not: "dismissed" } }) }, orderBy: [{ createdAt: "desc" }], take: 200, include: { post: { select: { id: true, status: true, keyframeUrl: true, planDate: true } } } });
  return NextResponse.json({ items, calibration: actor.insightsSummary?.calibration || null });
}

/** POST { count?, platforms?, focus? } | { channelPostId } | { benchmarkPostId } */
export async function POST(req, { params }) {
  const { id } = await params;
  const { actor } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!(await serverAiEnabled())) return NextResponse.json(subscriptionHint("recommend-posts"), { status: 409 });
  try {
    const platforms = Array.isArray(body.platforms) && body.platforms.length ? body.platforms : ["instagram", "facebook"];
    const r = body.channelPostId || body.benchmarkPostId
      ? await recommendLike(id, { channelPostId: body.channelPostId, benchmarkPostId: body.benchmarkPostId, platforms })
      : await recommendPosts(id, { count: Math.min(15, Math.max(1, Number(body.count) || 10)), platforms, focus: String(body.focus || "").slice(0, 500) });
    return NextResponse.json(r);
  } catch (err) {
    console.error("[RECOMMEND_ERROR]", err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
