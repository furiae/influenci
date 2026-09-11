import { sleep, FatalError, RetryableError } from "workflow";
import { prisma } from "@/lib/prisma";
import { WavespeedError } from "@/lib/identity/wavespeed";
import { generateReferenceSet } from "@/lib/identity/references";
import { createKlingElement } from "@/lib/identity/element";
import { buildPetDataset } from "@/lib/identity/dataset";
import { submitLoraTraining, checkLoraTraining, triggerWordFor } from "@/lib/identity/lora";
import { logEvent } from "@/lib/scheduler/status";

/**
 * Lock an actor's visual identity.
 * humans: hero image -> 4 generated angles -> (optional) Kling element
 * pets:   uploaded photos -> zip -> FLUX LoRA (about 7 minutes)
 */
export async function trainIdentityWorkflow(actorId, { skipElement = false } = {}) {
  "use workflow";
  const kind = await beginIdentity(actorId);
  if (kind === "human") {
    await humanReferences(actorId);
    if (!skipElement) await humanElement(actorId);
    return await markReady(actorId);
  }
  const predictionId = await petSubmit(actorId);
  for (;;) {
    await sleep("60s");
    const r = await petCheck(actorId, predictionId);
    if (r.done) return r.ok ? await markReady(actorId) : await markFailed(actorId, r.error);
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

async function humanReferences(actorId) {
  "use step";
  const actor = await prisma.actor.findUnique({ where: { id: actorId } });
  if ((actor.referenceImages || []).length >= 4) return { cached: true };
  try {
    const { urls, cents } = await generateReferenceSet(actor);
    await prisma.actor.update({ where: { id: actorId }, data: { referenceImages: [...(actor.referenceImages || []), ...urls] } });
    await logEvent({ actorId, kind: "identity", step: "references", costCents: cents, message: `${urls.length} reference images` });
    return { cached: false, count: urls.length };
  } catch (err) {
    throw wrap(err);
  }
}
humanReferences.maxRetries = 2;

async function humanElement(actorId) {
  "use step";
  const actor = await prisma.actor.findUnique({ where: { id: actorId } });
  if (actor.klingElementId) return { cached: true };
  try {
    const { elementId, cents } = await createKlingElement(actor);
    await prisma.actor.update({ where: { id: actorId }, data: { klingElementId: elementId } });
    await logEvent({ actorId, kind: "identity", step: "element", costCents: cents, message: `element ${elementId}` });
    return { cached: false };
  } catch (err) {
    // Element is optional; keyframes already carry identity.
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
  return { actorId, status: "failed", error };
}
