import { wsSubmit, wsWait } from "./wavespeed";
import { RENDER, keyframeCents } from "@/lib/render/models";
import { buildKeyframePrompt } from "@/lib/personas/prompts";
import { copyToBlob, extFor } from "@/lib/render/store";

/** Reference images to condition on: hero first, then the generated set. */
export function referenceSet(actor, max = 6) {
  const refs = [actor.imageUrl, ...(actor.referenceImages || [])].filter(Boolean);
  return [...new Set(refs)].slice(0, max);
}

/**
 * Generate one keyframe for a script and copy it to Blob.
 * Humans: multi-reference edit (Nano Banana Pro). Pets with a LoRA: FLUX.2 edit-lora.
 * Returns { url, cents, prompt, requestId }.
 */
export async function submitKeyframeRequest({ actor, script, seed }) {
  const prompt = buildKeyframePrompt(actor, script);
  let slug;
  let body;
  if (actor.kind === "pet" && actor.loraUrl) {
    slug = RENDER.pet.keyframeLora.slug;
    body = {
      prompt,
      images: referenceSet(actor, 2),
      loras: [{ path: actor.loraUrl, scale: 1 }],
      output_format: "jpeg",
      ...(seed != null ? { seed } : {}),
    };
  } else {
    slug = RENDER.references.slug;
    body = {
      prompt,
      images: referenceSet(actor, 6),
      aspect_ratio: "9:16",
      output_format: "jpeg",
      ...(seed != null ? { seed } : {}),
    };
  }
  const requestId = await wsSubmit(slug, body);
  return { requestId, prompt };
}

/** Synchronous variant for interactive use (test keyframe button). */
export async function generateKeyframe({ actor, script, seed, pathPrefix = "keyframes" }) {
  const { requestId, prompt } = await submitKeyframeRequest({ actor, script, seed });
  const outputs = await wsWait(requestId, { intervalMs: 3000, timeoutMs: 4 * 60 * 1000 });
  const src = outputs[0];
  if (!src) throw new Error("Keyframe model returned no image");
  const stored = await copyToBlob(src, `${pathPrefix}/${actor.slug || actor.id}-${Date.now()}.${extFor(src, "jpg")}`, { contentType: "image/jpeg" });
  return { url: stored.url, cents: keyframeCents(actor), prompt, requestId };
}
