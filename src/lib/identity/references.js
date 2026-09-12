import { wsSubmit, wsWait } from "./wavespeed";
import { RENDER } from "@/lib/render/models";
import { copyToBlob, extFor } from "@/lib/render/store";

const ANGLES = [
  "three-quarter view from the left, same expression",
  "three-quarter view from the right, slight smile",
  "clean side profile facing left",
  "full-body shot standing naturally, whole figure visible",
];

/**
 * Build a small multi-angle reference set from the hero image so later
 * keyframes can condition on several views. Returns { urls, cents }.
 */
export async function generateReferenceSet(actor, { count = 4 } = {}) {
  const identity = actor.canonicalPrompt?.trim() || actor.name;
  const urls = [];
  let cents = 0;
  for (const angle of ANGLES.slice(0, count)) {
    const prompt = `${identity}. Same individual as the reference image with identical features and markings, ${angle}, neutral plain background, soft even studio lighting, photorealistic, sharp focus, no text.`;
    const id = await wsSubmit(RENDER.references.slug, {
      prompt,
      images: [actor.imageUrl],
      aspect_ratio: "3:4",
      output_format: "jpeg",
    });
    const outputs = await wsWait(id, { intervalMs: 3000, timeoutMs: 8 * 60 * 1000 });
    if (!outputs[0]) continue;
    const stored = await copyToBlob(outputs[0], `refs/${actor.slug || actor.id}-${urls.length + 1}.${extFor(outputs[0], "jpg")}`, { contentType: "image/jpeg" });
    urls.push(stored.url);
    cents += RENDER.references.cents;
  }
  return { urls, cents };
}
