/** Read a byte range of a public URL (for chunked uploads without buffering everything). */
export async function readRange(url, start, endInclusive) {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${endInclusive}` } });
  if (res.status !== 206 && res.status !== 200) throw new Error(`Range read failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (res.status === 200) return buf.subarray(start, endInclusive + 1); // server ignored Range
  return buf;
}

/** Content length via HEAD (falls back to a GET with Range 0-0). */
export async function contentLength(url) {
  const head = await fetch(url, { method: "HEAD" });
  const len = Number(head.headers.get("content-length"));
  if (Number.isFinite(len) && len > 0) return len;
  const r = await fetch(url, { headers: { Range: "bytes=0-0" } });
  const cr = r.headers.get("content-range");
  const m = cr && /\/(\d+)$/.exec(cr);
  if (m) return Number(m[1]);
  throw new Error("Could not determine file size");
}

/** Whole file as a Buffer (fine for our ≤ 30 MB clips). */
export async function readAll(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
