import { NextResponse } from "next/server";
import { ownedBrand as owned } from "@/lib/accounts";
import { prisma } from "@/lib/prisma";
import { mergeBrandProfile } from "@/lib/personas/brand";
import { isValidTimezone } from "@/lib/time";
import { resolveCadence } from "@/lib/scheduler/cadence";
import { OUTDOOR_COMPETITORS } from "@/lib/personas/competitors";

const CHANNEL_SELECT = { id: true, platform: true, externalId: true, handle: true, displayName: true, avatarUrl: true, status: true, lastError: true, followers: true, following: true, mediaCount: true, lastSyncedAt: true, lastPublishedAt: true, lastCheckedAt: true, config: true, scopes: true };

export async function GET(req, { params }) {
  const { id } = await params;
  const { actor } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  const full = await prisma.actor.findUnique({
    where: { id },
    include: {
      channels: { select: CHANNEL_SELECT },
      posts: { orderBy: { createdAt: "desc" }, take: 30, include: { targets: { select: { id: true, platform: true, status: true, scheduledAt: true, url: true } } } },
      _count: { select: { channelPosts: true, recommendations: true, posts: true, competitors: true } },
    },
  });
  const channels = full.channels.map(({ config, ...c }) => ({ ...c, availablePages: config?.availablePages || [], pageId: config?.pageId || null }));
  const events = await prisma.pipelineEvent.findMany({ where: { actorId: id, kind: { in: ["import", "insights", "recommend"] } }, orderBy: { createdAt: "desc" }, take: 15 });
  const scored = await prisma.channelPost.aggregate({ where: { actorId: id, score: { not: null } }, _avg: { score: true, engagementRate: true }, _count: { _all: true } });
  return NextResponse.json({ ...full, channels, events, stats: { scored: scored._count._all, avgScore: scored._avg.score, avgER: scored._avg.engagementRate }, cadenceResolved: resolveCadence(full) });
}

/** PATCH { name?, imageUrl?, timezone?, notes?, brandProfile?, autoPublish?, cadence?, active? } */
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const { actor } = await owned(id);
    if (!actor) return new NextResponse("Unauthorized", { status: 401 });
    const body = await req.json();
    const data = {};
    if (body.name !== undefined) data.name = String(body.name).trim().slice(0, 80);
    if (body.imageUrl !== undefined && /^https:\/\//.test(body.imageUrl)) data.imageUrl = body.imageUrl;
    if (body.timezone !== undefined && isValidTimezone(body.timezone)) data.timezone = body.timezone;
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).slice(0, 1000) : null;
    if (body.brandProfile !== undefined) {
      data.brandProfile = mergeBrandProfile(actor.brandProfile, body.brandProfile);
      data.bible = { ...(actor.bible || {}), category: data.brandProfile.category || actor.bible?.category || "" };
    }
    if (body.autoPublish !== undefined) data.autoPublish = Boolean(body.autoPublish);
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (body.cadence !== undefined && body.cadence && typeof body.cadence === "object") data.cadence = { ...resolveCadence({ cadence: body.cadence }), autoPlan: Boolean(body.cadence.autoPlan) };
    if (data.name === "") return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    const updated = await prisma.actor.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[BRAND_UPDATE_ERROR]", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

/** POST { action: "seed-competitors" } → add the outdoor-niche reference accounts. */
export async function POST(req, { params }) {
  const { id } = await params;
  const { actor } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "seed-competitors") {
    let added = 0;
    for (const c of OUTDOOR_COMPETITORS) {
      const r = await prisma.competitor.upsert({
        where: { actorId_platform_handle: { actorId: id, platform: c.platform, handle: c.handle } },
        update: {},
        create: { actorId: id, platform: c.platform, handle: c.handle, notes: "outdoor niche starter" },
      });
      if (Date.now() - new Date(r.createdAt).getTime() < 5000) added += 1;
    }
    return NextResponse.json({ added });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const { actor } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  await prisma.actor.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
