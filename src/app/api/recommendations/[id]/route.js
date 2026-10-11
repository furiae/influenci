import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPostFromRecommendation, schedulePreviewPost, discardPreviewPost } from "@/lib/insights/post-from-rec";

export const maxDuration = 120;

async function ownedRec(id) {
  const user = await requireUser();
  if (!user) return { user: null, rec: null };
  const rec = await prisma.recommendation.findFirst({ where: { id, actor: { userId: user.id } } });
  return { user, rec };
}

/** PATCH { status?, caption?, hashtags?, title?, platforms? } */
export async function PATCH(req, { params }) {
  const { id } = await params;
  const { rec } = await ownedRec(id);
  if (!rec) return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const data = {};
  if (["suggested", "saved", "dismissed"].includes(body.status)) data.status = body.status;
  if (body.caption !== undefined) data.caption = String(body.caption).slice(0, 5000);
  if (body.title !== undefined) data.title = String(body.title).slice(0, 120);
  if (Array.isArray(body.hashtags)) data.hashtags = body.hashtags.map((h) => String(h).replace(/^#/, "")).slice(0, 30);
  if (Array.isArray(body.platforms)) data.platforms = body.platforms.filter((p) => ["instagram", "facebook"].includes(p));
  if (body.visualBrief && typeof body.visualBrief === "object") data.visualBrief = { ...(rec.visualBrief || {}), ...body.visualBrief };
  const updated = await prisma.recommendation.update({ where: { id }, data });
  return NextResponse.json(updated);
}

/**
 * POST { action: "preview", referenceImages? }            → render only (no date, no platforms, never published)
 * POST { action: "schedule", platforms?, date? }           → final step: add platforms + date to the previewed post
 * POST { action: "discard-preview" }                       → throw the preview away
 * POST { action: "create-post", platforms?, date?, referenceImages? } → preview + schedule in one go (legacy)
 */
export async function POST(req, { params }) {
  const { id } = await params;
  const { user, rec } = await ownedRec(id);
  if (!rec) return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const refs = Array.isArray(body.referenceImages) ? body.referenceImages.filter((u) => /^https:\/\//.test(u)).slice(0, 4) : [];
  try {
    if (body.action === "schedule") return NextResponse.json(await schedulePreviewPost(rec, { platforms: body.platforms, date: body.date, userId: user.id }));
    if (body.action === "discard-preview") return NextResponse.json({ discarded: Boolean(await discardPreviewPost(rec, { userId: user.id })) });
    if (rec.postId) return NextResponse.json({ error: "A post was already created from this recommendation" }, { status: 400 });
    const post = await createPostFromRecommendation(rec, { platforms: body.platforms, date: body.date, referenceImages: refs, userId: user.id, preview: body.action === "preview" });
    return NextResponse.json(post, { status: 201 });
  } catch (err) {
    console.error("[REC_POST_ERROR]", err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const { rec } = await ownedRec(id);
  if (!rec) return new NextResponse("Unauthorized", { status: 401 });
  await prisma.recommendation.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
