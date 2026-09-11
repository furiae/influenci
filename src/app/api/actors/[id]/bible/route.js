import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateBible } from "@/lib/content/planner";
import { mergeBible } from "@/lib/personas/bible";
import { logEvent } from "@/lib/scheduler/status";

export const maxDuration = 120;

/** POST: draft a bible with Claude from the actor's name, kind and notes. */
export async function POST(req, { params }) {
  try {
    const user = await requireUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const { id } = await params;
    const actor = await prisma.actor.findFirst({ where: { id, userId: user.id } });
    if (!actor) return new NextResponse("Not Found", { status: 404 });
    const body = await req.json().catch(() => ({}));
    const { bible, canonicalPrompt, costCents } = await generateBible({ name: actor.name, kind: actor.kind, notes: body.notes || actor.notes || "" });
    const updated = await prisma.actor.update({
      where: { id },
      data: { bible: mergeBible(actor.bible, bible), canonicalPrompt: body.keepPrompt && actor.canonicalPrompt ? actor.canonicalPrompt : canonicalPrompt },
    });
    await logEvent({ actorId: id, kind: "plan", step: "bible", costCents });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[BIBLE_GENERATE_ERROR]", error);
    return NextResponse.json({ error: error.message || "Failed to generate bible" }, { status: 500 });
  }
}
