import { wsSubmit } from "@/lib/identity/wavespeed";
import { RENDER } from "./models";
import { designSystemToImagePrompt } from "@/lib/insights/design-system";

/**
 * Brand posts have no character identity: the keyframe is a brand-styled
 * image generated from the design system + visual brief (optionally edited
 * from reference photos such as a product shot or a winner photo).
 */
export function buildBrandImagePrompt(actor, post) {
  const script = post.script || {};
  if (script.keyframePrompt) return script.keyframePrompt;
  const brief = script.visualBrief || {};
  const base = designSystemToImagePrompt(actor.designSystem, brief);
  return `${base}${brief.subject ? "" : ` Scene: ${post.idea || post.hook || "outdoor lifestyle"}.`}`.trim();
}

/**
 * Prompt for generators that cannot spell (FLUX schnell and friends): the same
 * scene with no lettering at all. The headline is composited afterwards with
 * the free photo template, so the words are always right.
 */
export function cleanBrandImagePrompt(actor, post) {
  const brief = { ...(post.script?.visualBrief || {}), overlayText: undefined };
  const base = designSystemToImagePrompt(actor.designSystem, brief) || brief.notes || "";
  const scene = brief.subject ? "" : ` Scene: ${post.idea || post.hook || "outdoor lifestyle"}.`;
  return `${base}${scene} Clean photograph with no text, no lettering, no words, no signs, no logos, no watermark; leave the lower third uncluttered for a headline.`.replace(/\s+/g, " ").trim();
}

/** The words the post wants on the image, if any. */
export function brandOverlayText(post) {
  const s = post.script || {};
  return String(s.overlayText || s.visualBrief?.overlayText || "").trim();
}

export function brandAspect(post) {
  const a = post.script?.visualBrief?.aspect;
  if (["1:1", "4:5", "9:16", "16:9", "3:4"].includes(a)) return a;
  return post.mediaType === "video" ? "9:16" : "4:5";
}

/** Submit the keyframe; returns { requestId, prompt, slug }. */
export async function submitBrandKeyframe({ actor, post, seed }) {
  const prompt = buildBrandImagePrompt(actor, post);
  const refs = [...(post.script?.referenceImages || []), ...(post.script?.visualBrief?.referenceImages || [])].filter((u) => /^https?:\/\//.test(u)).slice(0, 4);
  const aspect = brandAspect(post);
  let slug;
  let body;
  if (refs.length) {
    slug = RENDER.brand.keyframeEdit.slug;
    body = { prompt, images: refs, aspect_ratio: aspect, output_format: "jpeg", ...(seed != null ? { seed } : {}) };
  } else {
    slug = RENDER.brand.keyframe.slug;
    body = { prompt, aspect_ratio: aspect, output_format: "jpeg", ...(seed != null ? { seed } : {}) };
  }
  const requestId = await wsSubmit(slug, body);
  return { requestId, prompt, slug };
}

export function brandMotionPrompt(actor, post) {
  const s = post.script || {};
  return s.motionPrompt || `Subtle cinematic motion: ${s.visualBrief?.notes || "slow push-in, natural light, gentle camera drift"}. Keep all text and logos legible and static. No new objects.`;
}
