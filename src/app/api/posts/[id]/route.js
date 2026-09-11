import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const INCLUDE = {
  actor: { select: { id: true, name: true, slug: true, kind: true, imageUrl: true, timezone: true, autoPublish: true } },
  targets: { orderBy: { scheduledAt: "asc" } },
  events: { orderBy: { createdAt: "desc" }, take: 40 },
};

export async function GET(req, { params }) {
  const user = await requireUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const post = await prisma.post.findFirst({ where: { id, userId: user.id }, include: INCLUDE });
  if (!post) return new NextResponse("Not Found", { status: 404 });
  return NextResponse.json(post);
}

/**
 * PATCH { status: "approved" | "draft" | "cancelled", idea?, hook?, script?, mediaType?, clipLengthSec? }
 * Approving queues every pending target; un-approving returns them to pending.
 */
export async function PATCH(req, { params }) {
  try {
    const user = await requireUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const { id } = await params;
    const post = await prisma.post.findFirst({ where: { id, userId: user.id } });
    if (!post) return new NextResponse("Not Found", { status: 404 });
    const body = await req.json();
    const data = {};

    if (body.idea !== undefined) data.idea = String(body.idea).trim().slice(0, 2000);
    if (body.hook !== undefined) data.hook = String(body.hook).trim().slice(0, 300);
    if (body.script !== undefined && body.script && typeof body.script === "object") data.script = { ...(post.script || {}), ...body.script };
    if (body.mediaType !== undefined) data.mediaType = body.mediaType === "image" ? "image" : "video";
    if (body.clipLengthSec !== undefined) data.clipLengthSec = body.clipLengthSec === 10 ? 10 : 5;

    if (body.status === "approved") {
      if (!["draft", "approved", "partial", "failed"].includes(post.status) || (!post.videoUrl && !post.keyframeUrl)) {
        return NextResponse.json({ error: "Only rendered posts can be approved." }, { status: 400 });
      }
      data.status = "approved";
      data.approvedAt = new Date();
      data.approvedBy = user.id;
      await prisma.postTarget.updateMany({ where: { postId: id, status: "pending" }, data: { status: "queued" } });
    } else if (body.status === "draft") {
      data.status = "draft";
      data.approvedAt = null;
      data.approvedBy = null;
      await prisma.postTarget.updateMany({ where: { postId: id, status: "queued" }, data: { status: "pending" } });
    } else if (body.status === "cancelled") {
      data.status = "cancelled";
      await prisma.postTarget.updateMany({ where: { postId: id, status: { in: ["pending", "queued"] } }, data: { status: "cancelled" } });
    }

    const updated = await prisma.post.update({ where: { id }, data, include: INCLUDE });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[POST_UPDATE_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const user = await requireUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const { count } = await prisma.post.deleteMany({ where: { id, userId: user.id } });
  if (!count) return new NextResponse("Not Found", { status: 404 });
  return NextResponse.json({ success: true });
}
