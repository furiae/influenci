import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slotsForDay } from "@/lib/scheduler/cadence";
import { renderPostWorkflow } from "@/workflows/render-post";
import { todayIn } from "@/lib/time";

const TARGET_SELECT = { id: true, platform: true, slotIndex: true, status: true, scheduledAt: true, url: true, error: true, title: true, caption: true, hashtags: true, settings: true, channelId: true, publishedAt: true };

/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&actorId=&status= */
export async function GET(req) {
  const user = await requireUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const q = new URL(req.url).searchParams;
  const where = { userId: user.id };
  if (q.get("actorId")) where.actorId = q.get("actorId");
  if (q.get("status")) where.status = q.get("status");
  if (q.get("from") || q.get("to")) where.planDate = { ...(q.get("from") ? { gte: q.get("from") } : {}), ...(q.get("to") ? { lte: q.get("to") } : {}) };
  const posts = await prisma.post.findMany({
    where,
    orderBy: [{ planDate: "asc" }, { sequence: "asc" }],
    take: 500,
    include: { actor: { select: { id: true, name: true, slug: true, kind: true, imageUrl: true, timezone: true } }, targets: { select: TARGET_SELECT, orderBy: { scheduledAt: "asc" } } },
  });
  return NextResponse.json(posts);
}

/** POST { actorId, idea, hook?, pillar?, date?, mediaType?, clipLengthSec? } → manual post + render. */
export async function POST(req) {
  try {
    const user = await requireUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const body = await req.json();
    const actor = await prisma.actor.findFirst({ where: { id: body.actorId, userId: user.id } });
    if (!actor) return NextResponse.json({ error: "Actor not found" }, { status: 404 });
    if (!actor.imageUrl) return NextResponse.json({ error: "Upload a main reference photo first." }, { status: 400 });
    const idea = String(body.idea || "").trim();
    if (!idea) return NextResponse.json({ error: "Describe the idea" }, { status: 400 });

    const tz = actor.timezone || "America/New_York";
    const planDate = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : todayIn(tz);
    const last = await prisma.post.findFirst({ where: { actorId: actor.id, planDate }, orderBy: { sequence: "desc" } });
    const sequence = (last?.sequence ?? 99) + 1; // manual posts start at 100 to avoid colliding with the planner
    const slots = slotsForDay(actor, planDate);
    const now = Date.now();

    const post = await prisma.post.create({
      data: {
        actorId: actor.id,
        userId: user.id,
        planDate,
        sequence: Math.max(sequence, 100),
        mediaType: body.mediaType === "image" ? "image" : "video",
        clipLengthSec: body.clipLengthSec === 10 ? 10 : 5,
        status: "planned",
        idea,
        pillar: body.pillar ? String(body.pillar).slice(0, 80) : null,
        hook: body.hook ? String(body.hook).slice(0, 200) : null,
        targets: {
          create: slots
            .filter((s, i, arr) => arr.findIndex((x) => x.platform === s.platform) === i) // one slot per platform
            .map((s) => ({ platform: s.platform, slotIndex: 100, scheduledAt: s.scheduledAt.getTime() > now ? s.scheduledAt : new Date(now + 30 * 60 * 1000), status: "pending" })),
        },
      },
      include: { targets: { select: TARGET_SELECT } },
    });
    const run = await start(renderPostWorkflow, [post.id]);
    await prisma.post.update({ where: { id: post.id }, data: { renderRunId: run.runId } });
    console.log("[POST_CREATE]", post.id, actor.name, run.runId);
    return NextResponse.json({ ...post, renderRunId: run.runId }, { status: 201 });
  } catch (error) {
    console.error("[POST_CREATE_ERROR]", error);
    return NextResponse.json({ error: error.message || "Failed to create post" }, { status: 500 });
  }
}
