import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { actingUser } from "@/lib/ops-auth";
import { prisma } from "@/lib/prisma";
import { trainIdentityWorkflow } from "@/workflows/train-identity";
import { generateKeyframe } from "@/lib/identity/keyframe";
import { scoreIdentity } from "@/lib/identity/qa";
import { logEvent } from "@/lib/scheduler/status";
import { wsSubmit, wsWait } from "@/lib/identity/wavespeed";
import { copyToBlob, extFor } from "@/lib/render/store";

export const maxDuration = 300;

/**
 * POST { action: "train" | "test-keyframe" | "reset" }
 * train:         start the identity workflow (references/element or LoRA)
 * test-keyframe: render one keyframe now and score it (blocks up to ~3 min)
 * reset:         clear identity assets so training can be redone
 * generate-hero: create the main portrait from the canonical prompt (AI characters without a photo)
 */
export async function POST(req, { params }) {
  try {
    const user = await actingUser(req);
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const { id } = await params;
    const actor = await prisma.actor.findFirst({ where: { id, userId: user.id } });
    if (!actor) return new NextResponse("Not Found", { status: 404 });
    const body = await req.json().catch(() => ({}));

    if (body.action === "reset") {
      const updated = await prisma.actor.update({
        where: { id },
        data: { identityStatus: "none", identityError: null, identityJobId: null, loraUrl: null, klingElementId: null, datasetZipUrl: null, ...(body.clearReferences ? { referenceImages: [] } : {}) },
      });
      return NextResponse.json(updated);
    }

    if (body.action === "generate-hero") {
      const identity = actor.canonicalPrompt?.trim();
      if (!identity) return NextResponse.json({ error: "Write the canonical prompt on the Profile tab first." }, { status: 400 });
      const prompt = `${identity}. Front-facing portrait looking at the camera, neutral friendly expression, ${actor.kind === "pet" ? "whole body visible, sitting" : "head and shoulders"}, plain soft-grey studio background, soft even lighting, photorealistic, sharp focus, no text.`;
      const id_ = await wsSubmit("google/nano-banana-pro/text-to-image", { prompt, aspect_ratio: "3:4", resolution: "1k", output_format: "jpeg" });
      const outputs = await wsWait(id_, { intervalMs: 3000, timeoutMs: 6 * 60 * 1000 });
      if (!outputs[0]) return NextResponse.json({ error: "No image returned" }, { status: 502 });
      const stored = await copyToBlob(outputs[0], `actors/${actor.slug || actor.id}/hero.${extFor(outputs[0], "jpg")}`, { contentType: "image/jpeg" });
      const updated = await prisma.actor.update({ where: { id }, data: { imageUrl: stored.url, identityStatus: "none", identityError: null } });
      await logEvent({ actorId: id, kind: "identity", step: "hero", costCents: 14, data: { url: stored.url } });
      console.log("[IDENTITY_HERO]", actor.name, stored.url);
      return NextResponse.json(updated);
    }

    if (!actor.imageUrl) return NextResponse.json({ error: "Upload a main reference photo first." }, { status: 400 });

    if (body.action === "train") {
      if (["training", "generating_refs"].includes(actor.identityStatus)) return NextResponse.json({ error: "Identity is already being built." }, { status: 409 });
      const run = await start(trainIdentityWorkflow, [id, { skipElement: Boolean(body.skipElement) }]);
      await prisma.actor.update({ where: { id }, data: { identityStatus: actor.kind === "pet" ? "training" : "generating_refs" } });
      console.log("[IDENTITY_TRAIN] started", actor.name, run.runId);
      return NextResponse.json({ runId: run.runId });
    }

    if (body.action === "test-keyframe") {
      const script = { keyframePrompt: body.prompt || "a candid, natural moment in one of their usual settings, looking toward the camera", wardrobe: body.wardrobe || "" };
      const kf = await generateKeyframe({ actor, script, pathPrefix: "tests" });
      const qa = await scoreIdentity({ actor, candidateUrl: kf.url });
      await logEvent({ actorId: id, kind: "identity", step: "test_keyframe", costCents: kf.cents + qa.cents, message: `score ${qa.score.toFixed(2)}`, data: { url: kf.url, issues: qa.issues } });
      return NextResponse.json({ url: kf.url, prompt: kf.prompt, score: qa.score, pass: qa.pass, issues: qa.issues, usable: qa.usable });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[IDENTITY_ROUTE_ERROR]", error);
    return NextResponse.json({ error: error.message || "Identity action failed" }, { status: 500 });
  }
}
