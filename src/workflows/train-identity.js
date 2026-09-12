import { sleep, FatalError, RetryableError } from "workflow";
import { prisma } from "@/lib/prisma";
import { wsSubmit, wsResult, WavespeedError } from "@/lib/identity/wavespeed";
import { RENDER } from "@/lib/render/models";
import { copyToBlob, extFor } from "@/lib/render/store";
import { createKlingElement } from "@/lib/identity/element";
import { buildPetDataset } from "@/lib/identity/dataset";
import { submitLoraTraining, checkLoraTraining, triggerWordFor } from "@/lib/identity/lora";
import { logEvent } from "@/lib/scheduler/status";

const ANGLES = [
  "three-quarter view from the left, same expression",
  "three-quarter view from the right, slight smile",
  "clean side profile facing left",
  "full-body shot standing naturally, whole figure visible",
];

/**
 * Lock an actor's visual identity. Every provider call is a short step
 * (submit → sleep/poll → store) so no step outlives a function invocation.
 * humans: hero image -> 4 generated angles -> (optional) Kling element
 * pets:   uploaded photos -> zip -> FLUX LoRA (about 7 minutes)
 */
export async function trainIdentityWorkflow(actorId, { skipElement = false } = {}) {
  "use workflow";
  try {
    const kind = await beginIdentity(actorId);

    if (kind === "human") {
      const have = await referenceCount(actorId);
      for (let i = have; i < ANGLES.length; i++) {
        const requestId = await submitReference(actorId, i);
        let r;
        do {
          await sleep("15s");
          r = await pollPrediction(requestId);
        } while (!r.done);
        if (r.url) await storeReference(actorId, i, r.url);
      }
      if (!skipElement) await humanElement(actorId);
      return await markReady(actorId);
    }

    const predictionId = await petSubmit(actorId);
    for (;;) {
      await sleep("60s");
      const r = await petCheck(actorId, predictionId);
      if (r.done) return r.ok ? await markReady(actorId) : await markFailed(actorId, r.error);
    }
  } catch (err) {
    return await markFailed(actorId, err?.message || String(err));
  }
}

function wrap(err) {
  if (err instanceof WavespeedError) return err.retryable ? new RetryableError(err.message, { retryAfter: "30s" }) : new FatalError(err.message);
  return err;
}

async function beginIdentity(actorId) {
  "use step";
  const actor = await prisma.actor.findUnique({ where: { id: actorId } });
  if (!actor) throw new FatalError("Actor not found");
  if (!actor.imageUrl) throw new FatalError("Upload a reference photo first");
  await prisma.actor.update({ where: { id: actorId }, data: { identityStatus: actor.kind === "pet" ? "training" : "generating_refs", identityError: null } });
  console.log("[IDENTITY] begin", actor.name, actor.kind);
  return actor.kind;
}

async function referenceCount(actorId) {
  "use step";
  const actor = await prisma.actor.findUnique({ where: { id: actorId }, select: { referenceImages: true } });
  return Math.min(ANGLES.length, (actor?.referenceImages || []).length);
}

async function submitReference(actorId, index) {
  "use step";
  const actor = await prisma.actor.findUnique({ where: { id: actorId } });
  const identity = actor.canonicalPrompt?.trim() || actor.name;
  const prompt = `${identity}. Same individual as the reference image with identical features and markings, ${ANGLES[index]}, neutral plain background, soft even studio lighting, photorealistic, sharp focus, no text.`;
  try {
    const id = await wsSubmit(RENDER.references.slug, { prompt, images: [actor.imageUrl], aspect_ratio: "3:4", output_format: "jpeg" });
    console.log("[IDENTITY] reference submitted", actor.name, index, id);
    return id;
  } catch (err) {
    throw wrap(err);
  }
}
submitReference.maxRetries = 2;

async function pollPrediction(requestId) {
  "use step";
  try {
    const r = await wsResult(requestId);
    if (r.status === "completed") return { done: true, url: r.outputs[0] || null };
    if (r.status === "failed") {
      console.error("[IDENTITY] prediction failed", requestId, r.error);
      return { done: true, url: null, error: r.error };
    }
    return { done: false };
  } catch (err) {
    throw wrap(err);
  }
}
pollPrediction.maxRetries = 5;

async function storeReference(actorId, index, sourceUrl) {
  "use step";
  const actor = await prisma.actor.findUnique({ where: { id: actorId } });
  const stored = await copyToBlob(sourceUrl, `refs/${actor.slug || actor.id}-${index + 1}.${extFor(sourceUrl, "jpg")}`, { contentType: "image/jpeg" });
  const refs = [...(actor.referenceImages || [])];
  refs[index] = stored.url;
  await prisma.actor.update({ where: { id: actorId }, data: { referenceImages: refs.filter(Boolean) } });
  await logEvent({ actorId, kind: "identity", step: "reference", costCents: RENDER.references.cents, message: ANGLES[index], data: { url: stored.url } });
  console.log("[IDENTITY] reference stored", actor.name, index);
  return stored.url;
}
storeReference.maxRetries = 3;

async function humanElement(actorId) {
  "use step";
  const actor = await prisma.actor.findUnique({ where: { id: actorId } });
  if (actor.klingElementId) return { cached: true };
  try {
    const { elementId, cents } = await createKlingElement(actor);
    await prisma.actor.update({ where: { id: actorId }, data: { klingElementId: elementId } });
    await logEvent({ actorId, kind: "identity", step: "element", costCents: cents, message: `element ${elementId}` });
    console.log("[IDENTITY] element", actor.name, elementId);
    return { cached: false };
  } catch (err) {
    // Element is optional; keyframes already carry identity.
    console.warn("[IDENTITY] element skipped", actor.name, err?.message);
    await logEvent({ actorId, kind: "identity", step: "element", status: "failed", message: String(err?.message || err) });
    return { cached: false, skipped: true };
  }
}

async function petSubmit(actorId) {
  "use step";
  const actor = await prisma.actor.findUnique({ where: { id: actorId } });
  if (actor.identityJobId) return actor.identityJobId;
  try {
    const triggerWord = triggerWordFor(actor);
    const dataset = actor.datasetZipUrl ? { url: actor.datasetZipUrl } : await buildPetDataset(actor, { triggerWord });
    const predictionId = await submitLoraTraining(actor, dataset.url);
    await prisma.actor.update({ where: { id: actorId }, data: { datasetZipUrl: dataset.url, identityJobId: predictionId, loraTriggerWord: triggerWord } });
    await logEvent({ actorId, kind: "identity", step: "lora_submit", costCents: 100, data: { predictionId } });
    console.log("[IDENTITY] LoRA submitted", actor.name, predictionId);
    return predictionId;
  } catch (err) {
    throw err instanceof WavespeedError ? wrap(err) : new FatalError(err.message);
  }
}
petSubmit.maxRetries = 1;

async function petCheck(actorId, predictionId) {
  "use step";
  try {
    const r = await checkLoraTraining(predictionId);
    if (r.status === "completed") {
      await prisma.actor.update({ where: { id: actorId }, data: { loraUrl: r.loraUrl, identityJobId: null } });
      await logEvent({ actorId, kind: "identity", step: "lora_done", data: { loraUrl: r.loraUrl } });
      console.log("[IDENTITY] LoRA done", actorId);
      return { done: true, ok: true };
    }
    if (r.status === "failed") return { done: true, ok: false, error: r.error };
    return { done: false };
  } catch (err) {
    throw wrap(err);
  }
}
petCheck.maxRetries = 5;

async function markReady(actorId) {
  "use step";
  await prisma.actor.update({ where: { id: actorId }, data: { identityStatus: "ready", identityError: null, identityJobId: null } });
  console.log("[IDENTITY] ready", actorId);
  return { actorId, status: "ready" };
}

async function markFailed(actorId, error) {
  "use step";
  await prisma.actor.update({ where: { id: actorId }, data: { identityStatus: "failed", identityError: String(error || "unknown").slice(0, 500), identityJobId: null } });
  await logEvent({ actorId, kind: "identity", step: "failed", status: "failed", message: String(error) });
  console.error("[IDENTITY] failed", actorId, error);
  return { actorId, status: "failed", error };
}
