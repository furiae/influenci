import { NextResponse } from "next/server";
import { ownedBrand as owned } from "@/lib/accounts";
import { computeStats } from "@/lib/insights/stats";
import { buildInsightsSummary, settleRecommendations } from "@/lib/insights/summary";
import { rescoreActor } from "@/lib/insights/sync";
import { serverAiEnabled, subscriptionHint } from "@/lib/content/ai-mode";

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
      const { scored } = await rescoreActor(id);
      await settleRecommendations(id);
      return NextResponse.json({ scored });
    }
    if (!(await serverAiEnabled())) return NextResponse.json(subscriptionHint("weekly-review"), { status: 409 });
    const { summary } = await buildInsightsSummary(id);
    await settleRecommendations(id);
    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
