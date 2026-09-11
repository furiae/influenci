import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeVariants } from "@/lib/content/planner";
import { logEvent } from "@/lib/scheduler/status";
import { PLATFORMS } from "@/lib/platforms";

export const maxDuration = 120;

/** POST → regenerate captions for all targets that are not yet published. */
export async function POST(req, { params }) {
  try {
    const user = await requireUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const { id } = await params;
    const post = await prisma.post.findFirst({ where: { id, userId: user.id }, include: { actor: true, targets: true } });
    if (!post) return new NextResponse("Not Found", { status: 404 });
    if (!post.script) return NextResponse.json({ error: "No script yet; render first." }, { status: 400 });
    const { variants, costCents } = await writeVariants({ actor: post.actor, script: post.script, idea: { idea: post.idea }, platforms: PLATFORMS });
    for (const t of post.targets) {
      if (["published", "publishing"].includes(t.status)) continue;
      const v = variants[t.platform];
      if (v) await prisma.postTarget.update({ where: { id: t.id }, data: { caption: v.caption, title: v.title, hashtags: v.hashtags } });
    }
    await logEvent({ postId: id, actorId: post.actorId, kind: "render", step: "captions_regen", costCents });
    const updated = await prisma.post.findUnique({ where: { id }, include: { targets: { orderBy: { scheduledAt: "asc" } } } });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[CAPTIONS_ERROR]", error);
    return NextResponse.json({ error: error.message || "Failed to regenerate captions" }, { status: 500 });
  }
}
