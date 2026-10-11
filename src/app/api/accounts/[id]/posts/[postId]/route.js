import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownedBrand as owned } from "@/lib/accounts";
import { analyzeChannelPost } from "@/lib/insights/analyze";

export const maxDuration = 60;

export async function GET(req, { params }) {
  const { id, postId } = await params;
  const { actor } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  const post = await prisma.channelPost.findFirst({ where: { id: postId, actorId: id }, include: { metrics: { orderBy: { capturedAt: "asc" }, take: 60 }, channel: { select: { platform: true, handle: true, followers: true } } } });
  if (!post) return new NextResponse("Not Found", { status: 404 });
  return NextResponse.json(post);
}

/** POST { action: "analyze" } → (re)run Claude vision on this post. */
export async function POST(req, { params }) {
  const { id, postId } = await params;
  const { actor } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const analysis = await analyzeChannelPost(postId);
    return NextResponse.json({ analysis });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
