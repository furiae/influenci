import { NextResponse } from "next/server";
import { ownedBrand as owned } from "@/lib/accounts";
import { extractDesignSystem, saveDesignSystem, learnDesignSystem, resolveSuggestion } from "@/lib/insights/design-system";
import { prisma } from "@/lib/prisma";
import { serverAiEnabled, subscriptionHint } from "@/lib/content/ai-mode";

export const maxDuration = 120;

export async function GET(req, { params }) {
  const { id } = await params;
  const { actor } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  const history = await prisma.pipelineEvent.findMany({ where: { actorId: id, kind: "insights", step: { in: ["design_system", "design_learn"] } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, step: true, message: true, createdAt: true, data: true } });
  return NextResponse.json({ designSystem: actor.designSystem, version: actor.designSystemVersion, history });
}

/** POST { action: "extract" | "learn" | "accept" | "reject", suggestionId?, keys? } */
export async function POST(req, { params }) {
  const { id } = await params;
  const { actor } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  if ((body.action === "extract" || body.action === "learn") && !(await serverAiEnabled())) return NextResponse.json(subscriptionHint("extract-design-system"), { status: 409 });
  try {
    if (body.action === "extract") return NextResponse.json({ designSystem: await extractDesignSystem(id) });
    if (body.action === "learn") return NextResponse.json(await learnDesignSystem(id));
    if (body.action === "accept" || body.action === "reject") return NextResponse.json({ designSystem: await resolveSuggestion(id, body.suggestionId, { accept: body.action === "accept", keys: body.keys }) });
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

/** PATCH { ...designSystem fields } → save edits as a new version. */
export async function PATCH(req, { params }) {
  const { id } = await params;
  const { actor } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const allowed = ["palette", "typography", "logoPlacement", "imagery", "layoutPatterns", "overlayRules", "captionStyle", "postingRhythm", "doNots", "summary"];
  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  return NextResponse.json({ designSystem: await saveDesignSystem(id, patch) });
}
