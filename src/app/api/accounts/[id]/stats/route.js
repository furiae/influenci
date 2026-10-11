import { NextResponse } from "next/server";
import { ownedBrand as owned } from "@/lib/accounts";
import { computeStats } from "@/lib/insights/stats";
import { buildInsightsSummary, settleRecommendations } from "@/lib/insights/summary";
import { rescoreChannel } from "@/lib/insights/sync";
import { prisma } from "@/lib/prisma";

export const maxDuration = 120;

/** GET ?days= → deterministic stats for charts. */
export async function GET(req, { params }) {
  const { id } = await params;
  const { actor } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  const days = Math.min(730, Math.max(30, Number(new URL(req.url).searchParams.get("days")) || 365));
  const stats = await computeStats(id, { days });
  return NextResponse.json({ stats, summary: actor.insightsSummary || null });
}

/** POST { action: "summarize" | "rescore" } */
export async function POST(req, { params }) {
  const { id } = await params;
  const { actor } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "rescore") {
      const channels = await prisma.channel.findMany({ where: { actorId: id }, select: { id: true } });
      let scored = 0;
      for (const c of channels) scored += (await rescoreChannel(c.id)).scored;
      await settleRecommendations(id);
      return NextResponse.json({ scored });
    }
    const { summary } = await buildInsightsSummary(id);
    await settleRecommendations(id);
    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
