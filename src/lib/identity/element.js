import { wsSubmit, wsWait } from "./wavespeed";
import { RENDER } from "@/lib/render/models";

/**
 * Create a reusable Kling "element" (identity token) from the reference set.
 * Optional: the keyframe already carries identity; this only helps on Kling
 * endpoints that accept element_list. Returns { elementId, cents }.
 */
export async function createKlingElement(actor) {
  const refs = (actor.referenceImages || []).filter(Boolean).slice(0, 4);
  const body = {
    name: String(actor.name).slice(0, 20),
    description: String(actor.canonicalPrompt || actor.name).slice(0, 100),
    reference_type: "image_refer",
    frontal_image: actor.imageUrl,
    ...(refs.length >= 2 ? { refer_images: refs } : {}),
  };
  const id = await wsSubmit(RENDER.element.slug, body);
  const outputs = await wsWait(id, { intervalMs: 3000, timeoutMs: 5 * 60 * 1000 });
  const first = outputs[0];
  const elementId = typeof first === "object" ? first?.element_id : first;
  if (elementId == null) throw new Error("Kling did not return an element id");
  return { elementId: String(elementId), cents: RENDER.element.cents };
}
