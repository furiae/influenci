import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceLimits } from "@/lib/content/limits";

/** PATCH { caption?, title?, hashtags?, settings?, scheduledAt?, status?: "pending"|"queued"|"cancelled" } */
export async function PATCH(req, { params }) {
  try {
    const user = await requireUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const { id, targetId } = await params;
    const target = await prisma.postTarget.findFirst({ where: { id: targetId, postId: id, post: { userId: user.id } }, include: { post: { select: { status: true } } } });
    if (!target) return new NextResponse("Not Found", { status: 404 });
    if (["published", "publishing"].includes(target.status)) return NextResponse.json({ error: "This target has already been published." }, { status: 400 });
    const body = await req.json();
    const data = {};

    if (body.caption !== undefined || body.title !== undefined || body.hashtags !== undefined) {
      const limited = enforceLimits(target.platform, {
        caption: body.caption ?? target.caption,
        text: body.caption ?? target.caption,
        description: body.caption ?? target.caption,
        title: body.title ?? target.title,
        hashtags: body.hashtags ?? target.hashtags,
      }, null);
      data.caption = limited.caption;
      data.title = limited.title;
      data.hashtags = limited.hashtags;
    }
    if (body.settings !== undefined && body.settings && typeof body.settings === "object") data.settings = { ...(target.settings || {}), ...body.settings };
    if (body.scheduledAt !== undefined) {
      const d = new Date(body.scheduledAt);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      data.scheduledAt = d;
    }
    if (body.status !== undefined) {
      if (!["pending", "queued", "cancelled"].includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      if (body.status === "queued" && target.post.status !== "approved") return NextResponse.json({ error: "Approve the post first." }, { status: 400 });
      data.status = body.status;
      if (body.status !== "cancelled") data.error = null;
    }

    const updated = await prisma.postTarget.update({ where: { id: targetId }, data });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[TARGET_UPDATE_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
