import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mergeBible } from "@/lib/personas/bible";
import { isValidTimezone } from "@/lib/time";
import { resolveCadence } from "@/lib/scheduler/cadence";

const GENDERS = ["female", "male", "non-binary"];
const AGES = ["18-24", "25-35", "36-50", "50+"];

export async function GET(req, { params }) {
  const user = await requireUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const actor = await prisma.actor.findFirst({
    where: { id, userId: user.id },
    include: {
      channels: { select: { id: true, platform: true, handle: true, displayName: true, avatarUrl: true, status: true, lastError: true, lastPublishedAt: true, config: true } },
      posts: { orderBy: { createdAt: "desc" }, take: 30, include: { targets: { select: { id: true, platform: true, status: true, scheduledAt: true, url: true } } } },
      _count: { select: { creations: true, posts: true } },
    },
  });
  if (!actor) return new NextResponse("Not Found", { status: 404 });
  return NextResponse.json({ ...actor, cadenceResolved: resolveCadence(actor) });
}

export async function PATCH(req, { params }) {
  try {
    const user = await requireUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const { id } = await params;
    const current = await prisma.actor.findFirst({ where: { id, userId: user.id } });
    if (!current) return new NextResponse("Not Found", { status: 404 });
    const body = await req.json();

    const data = {};
    if (body.name !== undefined) data.name = String(body.name).trim().slice(0, 80);
    if (body.slug !== undefined) data.slug = String(body.slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || null;
    if (body.kind !== undefined) data.kind = body.kind === "pet" ? "pet" : "human";
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (body.imageUrl !== undefined && /^https:\/\//.test(body.imageUrl)) data.imageUrl = body.imageUrl;
    if (body.gender !== undefined) data.gender = GENDERS.includes(body.gender) ? body.gender : null;
    if (body.ageRange !== undefined) data.ageRange = AGES.includes(body.ageRange) ? body.ageRange : null;
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim().slice(0, 1000) : null;
    if (body.timezone !== undefined && isValidTimezone(body.timezone)) data.timezone = body.timezone;
    if (body.bible !== undefined) data.bible = mergeBible(current.bible, body.bible);
    if (body.canonicalPrompt !== undefined) data.canonicalPrompt = String(body.canonicalPrompt).trim().slice(0, 1200) || null;
    if (body.negativePrompt !== undefined) data.negativePrompt = String(body.negativePrompt).trim().slice(0, 600) || null;
    if (body.referenceImages !== undefined && Array.isArray(body.referenceImages)) {
      data.referenceImages = body.referenceImages.filter((u) => typeof u === "string" && /^https:\/\//.test(u)).slice(0, 60);
    }
    if (body.autoPublish !== undefined) data.autoPublish = Boolean(body.autoPublish);
    if (body.videosPerDay !== undefined) data.videosPerDay = Math.max(0, Math.min(6, parseInt(body.videosPerDay, 10) || 0));
    if (body.defaultClip !== undefined && body.defaultClip && typeof body.defaultClip === "object") {
      data.defaultClip = {
        lengthSec: body.defaultClip.lengthSec === 10 ? 10 : 5,
        audio: body.defaultClip.audio !== false,
        mediaType: body.defaultClip.mediaType === "image" ? "image" : "video",
      };
    }
    if (body.cadence !== undefined && body.cadence && typeof body.cadence === "object") {
      data.cadence = resolveCadence({ cadence: body.cadence });
    }
    if (data.name === "") return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });

    const actor = await prisma.actor.update({ where: { id }, data });
    return NextResponse.json(actor);
  } catch (error) {
    if (error?.code === "P2002") return NextResponse.json({ error: "That slug is already used by another actor" }, { status: 400 });
    console.error("[ACTOR_UPDATE_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const user = await requireUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const { count } = await prisma.actor.deleteMany({ where: { id, userId: user.id } });
  if (!count) return new NextResponse("Not Found", { status: 404 });
  return NextResponse.json({ success: true });
}
