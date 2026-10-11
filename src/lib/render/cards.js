import { put } from "@vercel/blob";
import { renderCard, normalizeCard, renderSvgPng, TEMPLATES } from "./templates/apex-card";

export { TEMPLATES };

/** Validate the brief, render the card and store it in Blob. Returns { url, bytes, template, fields }. */
export async function renderCardToBlob({ actor, template, fields, photoUrl, pathname }) {
  const brief = normalizeCard({ template, fields, photoUrl });
  const { png } = await renderCard({ ...brief, actor });
  const blob = await put(pathname || `cards/${actor.slug || actor.id}/${template}-${Date.now()}.png`, png, { access: "public", contentType: "image/png", addRandomSuffix: true });
  return { url: blob.url, bytes: png.length, ...brief };
}

/** Rasterize a designed SVG (Claude-made or hand-made) and store it in Blob. Returns { url, bytes, width, height }. */
export async function renderSvgToBlob({ actor, svg, pathname }) {
  const { png, width, height } = await renderSvgPng(svg);
  const blob = await put(pathname || `cards/${actor.slug || actor.id}/svg-${Date.now()}.png`, png, { access: "public", contentType: "image/png", addRandomSuffix: true });
  return { url: blob.url, bytes: png.length, width, height };
}

/** True when a post's visual brief asks for a composited card or a designed SVG instead of a generated image. */
export function wantsCard(post) {
  const brief = post?.script?.visualBrief;
  return Boolean((brief?.template && TEMPLATES[brief.template]) || (typeof brief?.svg === "string" && brief.svg.length > 20));
}
