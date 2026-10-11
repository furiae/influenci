import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";

/**
 * Where brand keyframes (the generated image behind a post) come from.
 *
 *  zerogpu   FLUX.1 [schnell] (Apache 2.0) on a public Hugging Face ZeroGPU Space.
 *            Free; shared daily GPU quota; queues of a few seconds to a few minutes.
 *            An optional Hugging Face token raises the quota.
 *  gpu       FLUX.1 [schnell] on your own serverless GPU endpoint (Modal, RunPod,
 *            a box at home). Free inside the host's allowance. See
 *            scripts/modal_flux_schnell.py for a deployable endpoint that speaks
 *            the contract below.
 *  wavespeed Paid API (google/nano-banana-pro). Best quality, ~7¢ per image, and
 *            the only option that can edit from reference photos.
 *
 * Endpoint contract for "gpu":
 *   POST <endpoint>  Authorization: Bearer <token>   Content-Type: application/json
 *   { prompt, negative_prompt, width, height, seed, steps }
 *   → 200 with either an image body (Content-Type image/png|jpeg)
 *     or JSON { url } / { image: "<base64>", mime: "image/png" }
 */
export const IMAGE_PROVIDERS = {
  zerogpu: { label: "Hugging Face ZeroGPU · FLUX.1 schnell (free)", free: true, description: "Open-weight FLUX.1 schnell on a community GPU. Free, shared daily quota, can queue. Add a free Hugging Face token to raise the quota." },
  gpu: { label: "Your serverless GPU · FLUX.1 schnell (free allowance)", free: true, description: "The same open model on an endpoint you deploy (Modal, RunPod, your own machine). Free inside the host's monthly allowance, then pennies. Paste the endpoint URL and token below." },
  wavespeed: { label: "Wavespeed · nano-banana-pro (paid)", free: false, description: "Best quality and the only one that can edit from reference photos. About 7¢ per image; needs credits on the Wavespeed account." },
};

const KEY = "render.image";
const SPACE = "https://black-forest-labs-flux-1-schnell.hf.space";
const NEG = "blurry, low quality, distorted, deformed, extra limbs, bad hands, text, watermark, logo, signature";

export async function getImageSettings() {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  const v = row?.value || {};
  // Free by default; Wavespeed is an explicit choice even when its key is set.
  const provider = IMAGE_PROVIDERS[v.provider] ? v.provider : "zerogpu";
  return {
    provider,
    hfToken: v.hfTokenEnc ? safeDecrypt(v.hfTokenEnc) : process.env.HF_TOKEN || null,
    gpuEndpoint: v.gpuEndpoint || process.env.IMAGE_GPU_ENDPOINT || "",
    gpuToken: v.gpuTokenEnc ? safeDecrypt(v.gpuTokenEnc) : process.env.IMAGE_GPU_TOKEN || null,
  };
}

function safeDecrypt(enc) {
  try { return decrypt(enc); } catch { return null; }
}

/** Public (secret-free) view for the settings UI. */
export async function imageSettingsView() {
  const s = await getImageSettings();
  return {
    provider: s.provider,
    hasHfToken: Boolean(s.hfToken),
    gpuEndpoint: s.gpuEndpoint,
    hasGpuToken: Boolean(s.gpuToken),
    hasWavespeedKey: Boolean(process.env.WAVESPEED_API_KEY),
    providers: Object.entries(IMAGE_PROVIDERS).map(([id, p]) => ({ id, ...p })),
  };
}

export async function setImageSettings({ provider, hfToken, gpuEndpoint, gpuToken } = {}) {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  const value = { ...(row?.value || {}) };
  if (provider !== undefined) {
    if (!IMAGE_PROVIDERS[provider]) throw new Error("Unknown image provider");
    value.provider = provider;
  }
  if (hfToken !== undefined) value.hfTokenEnc = hfToken ? encrypt(String(hfToken).trim()) : "";
  if (gpuEndpoint !== undefined) {
    const u = String(gpuEndpoint || "").trim();
    if (u && !/^https:\/\//.test(u)) throw new Error("The GPU endpoint must be an https:// URL");
    value.gpuEndpoint = u;
  }
  if (gpuToken !== undefined) value.gpuTokenEnc = gpuToken ? encrypt(String(gpuToken).trim()) : "";
  value.updatedAt = new Date().toISOString();
  await prisma.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  return imageSettingsView();
}

/** Pixel size for FLUX schnell by post aspect (multiples of 16, ≤ ~1.2 MP). */
export function aspectToSize(aspect) {
  switch (aspect) {
    case "9:16": return { width: 768, height: 1360 };
    case "16:9": return { width: 1360, height: 768 };
    case "1:1": return { width: 1024, height: 1024 };
    case "3:4": return { width: 880, height: 1168 };
    default: return { width: 896, height: 1120 }; // 4:5
  }
}

/** FLUX.1 schnell on the official Hugging Face Space (Gradio /infer). Returns an image URL. */
export async function generateWithZeroGpu({ prompt, width, height, seed, hfToken }) {
  const { gradioCall } = await import("@/lib/providers/zerogpu");
  // /infer(prompt, seed, randomize_seed, width, height, num_inference_steps) → [image, seed]
  const data = await gradioCall(SPACE, { fn: "/infer" }, [prompt, seed ?? 0, seed == null, width, height, 4], hfToken || null);
  const out = Array.isArray(data) ? data[0] : data;
  const url = out?.url || (out?.path ? `${SPACE}/gradio_api/file=${out.path}` : null);
  if (!url) throw new Error("ZeroGPU Space returned no image");
  return { url };
}

/** Your own endpoint (see contract above). Returns { url } or { buffer, contentType }. */
export async function generateWithGpuEndpoint({ endpoint, token, prompt, width, height, seed, steps = 4 }) {
  if (!endpoint) throw new Error("No serverless GPU endpoint configured (Settings → Platform apps → AI → Image generator)");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, image/*", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ prompt, negative_prompt: NEG, width, height, seed: seed ?? null, steps }),
  });
  if (!res.ok) throw new Error(`GPU endpoint failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const type = (res.headers.get("content-type") || "").split(";")[0];
  if (type.startsWith("image/")) return { buffer: Buffer.from(await res.arrayBuffer()), contentType: type };
  const j = await res.json();
  if (j.url) return { url: j.url };
  if (j.image) return { buffer: Buffer.from(j.image, "base64"), contentType: j.mime || "image/png" };
  throw new Error("GPU endpoint returned neither an image nor { url } / { image }");
}

export function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  return null;
}

/**
 * Facebook, the card templates and the video model all want JPEG or PNG, and
 * Gradio Spaces hand back WebP by default: decode anything else to PNG.
 */
export async function normalizeImage(out) {
  let buffer = out.buffer;
  let contentType = out.contentType;
  if (!buffer) {
    const res = await fetch(out.url);
    if (!res.ok) throw new Error(`Could not download the generated image (${res.status})`);
    buffer = Buffer.from(await res.arrayBuffer());
    contentType = (res.headers.get("content-type") || "").split(";")[0];
  }
  const type = sniffImageType(buffer) || contentType || "application/octet-stream";
  if (type === "image/jpeg" || type === "image/png") return { buffer, contentType: type };
  if (!type.startsWith("image/")) throw new Error(`Provider returned ${type}, not an image`);
  const sharp = (await import("sharp")).default;
  return { buffer: await sharp(buffer).png().toBuffer(), contentType: "image/png" };
}

/**
 * Split the overlay text into the photo template's headline + subhead so a
 * long line still fits: a question or first sentence becomes the headline.
 */
export function splitOverlayText(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.length <= 70) return { headline: t };
  const m = t.match(/^(.{12,90}?[?!.])\s+(.+)$/);
  if (m) return { headline: m[1], subhead: m[2].slice(0, 90) };
  const cut = t.lastIndexOf(" ", 70);
  return cut > 20 ? { headline: t.slice(0, cut), subhead: t.slice(cut + 1, cut + 91) } : { headline: t.slice(0, 110) };
}

/**
 * Generate a brand keyframe with the selected free provider, normalise it to
 * JPEG/PNG and store it on Blob. Open-weight generators cannot spell, so the
 * image is asked for with no lettering and any overlay text is composited on
 * top with the free photo template. Returns { url, rawUrl, prompt, provider, composited }.
 */
export async function generateBrandImage({ actor, post, seed, settings, pathname }) {
  const { cleanBrandImagePrompt, brandOverlayText, brandAspect } = await import("./brand");
  const s = settings || (await getImageSettings());
  const prompt = cleanBrandImagePrompt(actor, post);
  const { width, height } = aspectToSize(brandAspect(post));
  let out;
  if (s.provider === "zerogpu") out = await generateWithZeroGpu({ prompt, width, height, seed, hfToken: s.hfToken });
  else if (s.provider === "gpu") out = await generateWithGpuEndpoint({ endpoint: s.gpuEndpoint, token: s.gpuToken, prompt, width, height, seed });
  else throw new Error(`Provider ${s.provider} is not a direct image provider`);
  const img = await normalizeImage(out);
  const ext = img.contentType === "image/jpeg" ? "jpg" : "png";
  const base = (pathname || `keyframes/${actor.slug || actor.id}/${post.id}-${s.provider}-${seed ?? 0}.png`).replace(/\.[a-z]+$/i, "");
  const raw = await put(`${base}-raw.${ext}`, img.buffer, { access: "public", contentType: img.contentType, addRandomSuffix: true });
  const fields = splitOverlayText(brandOverlayText(post));
  if (!fields) return { url: raw.url, rawUrl: raw.url, prompt, provider: s.provider, contentType: img.contentType, bytes: img.buffer.length, composited: false };
  const { renderCardToBlob } = await import("./cards");
  const card = await renderCardToBlob({ actor, template: "photo", fields, photoUrl: raw.url, pathname: `${base}.png` });
  return { url: card.url, rawUrl: raw.url, prompt, provider: s.provider, contentType: "image/png", bytes: card.bytes, composited: true, fields };
}
