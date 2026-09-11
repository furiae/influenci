import { zipSync } from "fflate";
import { put } from "@vercel/blob";

/**
 * Package the actor's uploaded photos (hero + referenceImages) into a zip for
 * LoRA training, with a caption file per image containing the trigger word.
 * Returns { url, count }.
 */
export async function buildPetDataset(actor, { triggerWord }) {
  const urls = [actor.imageUrl, ...(actor.referenceImages || [])].filter(Boolean);
  if (urls.length < 5) throw new Error(`Need at least 5 photos to train (have ${urls.length}). Upload more in the Identity tab.`);
  const files = {};
  let i = 0;
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) continue;
    const buf = new Uint8Array(await res.arrayBuffer());
    const ext = (res.headers.get("content-type") || "").includes("png") ? "png" : "jpg";
    i += 1;
    const base = `img_${String(i).padStart(3, "0")}`;
    files[`${base}.${ext}`] = buf;
    files[`${base}.txt`] = new TextEncoder().encode(`${triggerWord}, ${actor.canonicalPrompt || actor.name}`);
  }
  if (i < 5) throw new Error("Could not download enough photos for training");
  const zipped = zipSync(files, { level: 0 });
  const blob = await put(`datasets/${actor.slug || actor.id}-${Date.now()}.zip`, Buffer.from(zipped), {
    access: "public",
    contentType: "application/zip",
    addRandomSuffix: false,
  });
  return { url: blob.url, count: i };
}
