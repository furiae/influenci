import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderPostWorkflow } from "@/workflows/render-post";

/** POST { keepScript?: boolean } → re-render from scratch (or keep the script and only redo keyframe + video). */
export async function POST(req, { params }) {
  try {
    const user = await requireUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const { id } = await params;
    const post = await prisma.post.findFirst({ where: { id, userId: user.id } });
    if (!post) return new NextResponse("Not Found", { status: 404 });
    if (post.status === "rendering") return NextResponse.json({ error: "Already rendering" }, { status: 409 });
    const body = await req.json().catch(() => ({}));
    await prisma.post.update({
      where: { id },
      data: {
        status: "planned",
        renderError: null,
        keyframeUrl: null,
        keyframeQa: null,
        videoUrl: null,
        videoMeta: null,
        creationId: null,
        approvedAt: null,
        approvedBy: null,
        ...(body.keepScript ? {} : { script: null }),
      },
    });
    await prisma.postTarget.updateMany({ where: { postId: id, status: { in: ["queued", "skipped", "failed"] } }, data: { status: "pending", error: null } });
    if (!body.keepScript) await prisma.postTarget.updateMany({ where: { postId: id }, data: { caption: null, title: null, hashtags: [] } });
    const run = await start(renderPostWorkflow, [id]);
    await prisma.post.update({ where: { id }, data: { renderRunId: run.runId } });
    console.log("[POST_RERENDER]", id, run.runId);
    return NextResponse.json({ runId: run.runId });
  } catch (error) {
    console.error("[POST_RERENDER_ERROR]", error);
    return NextResponse.json({ error: error.message || "Failed to start render" }, { status: 500 });
  }
}
