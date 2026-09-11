import { NextResponse } from "next/server";
import { actingUser } from "@/lib/ops-auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PERSONAS } from "@/lib/personas/defaults";
import { mergeBible } from "@/lib/personas/bible";

/** Create the 7 launch personas for the acting user (idempotent by slug). */
export async function POST(req) {
  const user = await actingUser(req);
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
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
  console.log("[SEED_PERSONAS]", user.id, { created, existing });
  return NextResponse.json({ created, existing });
}
