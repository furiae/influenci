import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownedBrand as owned } from "@/lib/accounts";
import { generateBrandProfile } from "@/lib/content/brand-profile";
import { mergeBrandProfile } from "@/lib/personas/brand";
import { logEvent } from "@/lib/scheduler/status";

export const maxDuration = 120;

/** POST { notes? } → draft/refresh the brand profile with Claude (keeps links and user-edited notes). */
export async function POST(req, { params }) {
  const { id } = await params;
  const { actor } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const current = mergeBrandProfile(actor.brandProfile, {});
    const { profile, costCents } = await generateBrandProfile({ actorId: id, name: actor.name, website: current.website, notes: body.notes || current.notes, links: current.links });
    const merged = mergeBrandProfile(current, { ...profile, notes: body.notes || current.notes, seasonality: current.seasonality });
    await prisma.actor.update({ where: { id }, data: { brandProfile: merged, bible: { ...(actor.bible || {}), category: merged.category } } });
    await logEvent({ actorId: id, kind: "insights", step: "brand_profile", costCents });
    return NextResponse.json({ brandProfile: merged });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
