import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mergeBrandProfile } from "@/lib/personas/brand";
import { OUTDOOR_CATEGORY } from "@/lib/personas/competitors";

const CHANNEL_SELECT = { id: true, platform: true, handle: true, displayName: true, avatarUrl: true, status: true, lastError: true, followers: true, mediaCount: true, lastSyncedAt: true, lastPublishedAt: true };

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || null;
}

function handleFrom(url, host) {
  const m = String(url || "").match(new RegExp(`${host}/([^/?#]+)`, "i"));
  return m ? m[1].replace(/^@/, "") : String(url || "").replace(/^@/, "").trim();
}

/** GET → brand accounts (actors with kind "brand") with channels and headline numbers. */
export async function GET() {
  const user = await requireUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const actors = await prisma.actor.findMany({
    where: { userId: user.id, kind: "brand" },
    orderBy: { createdAt: "desc" },
    include: { channels: { select: CHANNEL_SELECT }, _count: { select: { channelPosts: true, recommendations: true, posts: true } } },
  });
  const out = [];
  for (const a of actors) {
    const agg = await prisma.channelPost.aggregate({ where: { actorId: a.id, score: { not: null } }, _avg: { score: true, engagementRate: true } });
    out.push({ ...a, avgScore: agg._avg.score, avgER: agg._avg.engagementRate });
  }
  return NextResponse.json(out);
}

/** POST { name, website?, facebook?, instagram?, notes?, imageUrl?, timezone? } → create a brand account. */
export async function POST(req) {
  try {
    const user = await requireUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const body = await req.json();
    const name = String(body.name || "").trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "Give the brand a name" }, { status: 400 });
    const links = {
      website: String(body.website || "").trim().slice(0, 300),
      facebook: handleFrom(body.facebook, "facebook\\.com").slice(0, 120),
      instagram: handleFrom(body.instagram, "instagram\\.com").slice(0, 120),
    };
    const brandProfile = mergeBrandProfile(null, { category: body.category || OUTDOOR_CATEGORY, website: links.website, links, notes: String(body.notes || "").slice(0, 2000) });
    const actor = await prisma.actor.create({
      data: {
        userId: user.id,
        name,
        slug: slugify(name),
        kind: "brand",
        imageUrl: /^https:\/\//.test(body.imageUrl || "") ? body.imageUrl : "",
        notes: body.notes ? String(body.notes).slice(0, 1000) : null,
        timezone: body.timezone || "America/New_York",
        brandProfile,
        bible: { category: brandProfile.category },
        defaultClip: { lengthSec: 5, audio: true, mediaType: "image" },
        cadence: { platforms: { instagram: { perDay: 1 }, facebook: { perDay: 1 }, tiktok: { perDay: 0 }, youtube: { perDay: 0 }, pinterest: { perDay: 0 }, x: { perDay: 0 } } },
        autoPublish: false,
      },
    });
    console.log("[BRAND_CREATE]", actor.id, name);
    return NextResponse.json(actor, { status: 201 });
  } catch (error) {
    if (error?.code === "P2002") return NextResponse.json({ error: "A brand with that name already exists" }, { status: 400 });
    console.error("[BRAND_CREATE_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
