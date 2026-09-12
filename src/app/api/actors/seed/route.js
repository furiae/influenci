import { NextResponse } from "next/server";
import { actingUser } from "@/lib/ops-auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PERSONAS } from "@/lib/personas/defaults";
import { DEFAULT_COMPETITORS, DEFAULT_CATEGORIES } from "@/lib/personas/competitors";
import { mergeBible } from "@/lib/personas/bible";

/**
 * POST {}                     → create the 7 launch personas (idempotent by slug)
 * POST { competitors: true }  → also add the starter reference accounts and category labels to existing actors
 */
export async function POST(req) {
  const user = await actingUser(req);
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const created = [];
  const existing = [];
  for (const p of DEFAULT_PERSONAS) {
    const found = await prisma.actor.findFirst({ where: { userId: user.id, slug: p.slug } });
    if (found) { existing.push(p.slug); continue; }
    const actor = await prisma.actor.create({
      data: {
        userId: user.id,
        name: p.name,
        slug: p.slug,
        kind: p.kind,
        gender: p.gender || null,
        ageRange: p.ageRange || null,
        imageUrl: "",
        canonicalPrompt: p.canonicalPrompt,
        bible: mergeBible(null, p.bible),
        cadence: p.cadence || null,
        defaultClip: { lengthSec: 5, audio: true, mediaType: "video" },
      },
    });
    created.push(actor.slug);
  }

  let competitorsAdded = 0;
  if (body.competitors) {
    const actors = await prisma.actor.findMany({ where: { userId: user.id, slug: { in: Object.keys(DEFAULT_COMPETITORS) } } });
    for (const actor of actors) {
      const bible = mergeBible(actor.bible, {});
      if (!bible.category && DEFAULT_CATEGORIES[actor.slug]) {
        await prisma.actor.update({ where: { id: actor.id }, data: { bible: { ...bible, category: DEFAULT_CATEGORIES[actor.slug] } } });
      }
      for (const c of DEFAULT_COMPETITORS[actor.slug] || []) {
        const r = await prisma.competitor.upsert({
          where: { actorId_platform_handle: { actorId: actor.id, platform: c.platform, handle: c.handle } },
          update: {},
          create: { actorId: actor.id, platform: c.platform, handle: c.handle, notes: "starter suggestion" },
        });
        if (Date.now() - new Date(r.createdAt).getTime() < 5000) competitorsAdded += 1;
      }
    }
  }
  console.log("[SEED_PERSONAS]", user.id, { created, existing, competitorsAdded });
  return NextResponse.json({ created, existing, competitorsAdded });
}
