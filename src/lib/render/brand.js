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
const TEXTY = /\b(text|overlay|headline|sub-?head|kicker|logo|wordmark|typography|font|letter|word|caption|banner|title|sign|label|cta|call to action|poster|graphic|card|template)\b|["“”]/i;

/** Drop every sentence that talks about words on the image; image models paint what they read. */
export function stripTextTalk(s) {
  return String(s || "").split(/(?<=[.;!?])\s+/).filter((part) => part && !TEXTY.test(part)).join(" ").trim();
}

export function cleanBrandImagePrompt(actor, post) {
  const brief = post.script?.visualBrief || {};
  const ds = actor.designSystem || {};
  const subject = stripTextTalk(brief.subject) || stripTextTalk(post.idea) || stripTextTalk(post.hook) || "outdoor hunting lifestyle";
  const composition = stripTextTalk(brief.composition);
  const notes = stripTextTalk(brief.notes);
  const styles = (ds.imagery?.styles || []).map(stripTextTalk).filter(Boolean).slice(0, 3).join(", ");
  const mood = (ds.palette || []).slice(0, 2).map((p) => p.hex).join(" and ");
  return [
    `Photorealistic documentary photograph of ${subject}.`,
    composition ? `${composition}.` : "",
    styles ? `Look: ${styles}.` : "",
    mood ? `Colour mood: deep ${mood} accents, dark moody background.` : "",
    notes ? `${notes}.` : "",
    "Natural light, sharp focus, real camera. Absolutely no text, no letters, no words, no numbers, no typography, no logos, no signs, no banners, no stickers, no borders, no graphic design elements, no watermark. Plain photograph only.",
  ].filter(Boolean).join(" ").replace(/\.\./g, ".").replace(/\s+/g, " ").trim();
}

/** Satori has no colour-emoji font; drop emoji and symbol glyphs before compositing. */
export function stripEmoji(s) {
  return String(s || "").replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu, "").replace(/\s+/g, " ").trim();
}

/**
 * The words to set on the image: the brief's overlay text, else the post's
 * hook. Brand photos always carry a headline, so the composited card never
 * comes out blank.
 */
export function brandOverlayText(post) {
  const s = post.script || {};
  return stripEmoji(s.overlayText || s.visualBrief?.overlayText || post.hook || "");
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
