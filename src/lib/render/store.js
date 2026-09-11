import { put } from "@vercel/blob";

/**
 * Copy a provider-hosted asset (their URLs expire) into Vercel Blob.
 * Returns { url, bytes, contentType }.
 */
export async function copyToBlob(sourceUrl, pathname, { contentType } = {}) {
  const res = await fetch(sourceUrl);
  if (!res.ok || !res.body) throw new Error(`Could not download asset (${res.status}) from provider`);
  const type = contentType || res.headers.get("content-type") || "application/octet-stream";
  const buffer = Buffer.from(await res.arrayBuffer());
  const blob = await put(pathname, buffer, { access: "public", contentType: type, addRandomSuffix: true });
  return { url: blob.url, bytes: buffer.length, contentType: type };
}

export function extFor(url, fallback = "bin") {
  const m = String(url).split("?")[0].match(/\.([a-z0-9]{2,4})$/i);
  return m ? m[1].toLowerCase() : fallback;
}
