/**
 * Thin Wavespeed transport for the operations pipeline (server key only).
 * Submit -> poll /predictions/{id}/result -> outputs.
 */
const BASE = "https://api.wavespeed.ai/api/v3";

function key() {
  const k = process.env.WAVESPEED_API_KEY;
  if (!k) throw new Error("WAVESPEED_API_KEY is not configured");
  return k;
}

export class WavespeedError extends Error {
  constructor(message, { status, retryable = false, body } = {}) {
    super(message);
    this.name = "WavespeedError";
    this.status = status;
    this.retryable = retryable;
    this.body = body;
  }
}

export async function wsSubmit(slug, body) {
  const res = await fetch(`${BASE}/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new WavespeedError(`Wavespeed ${slug} failed (${res.status}): ${json.message || json.error || JSON.stringify(json).slice(0, 300)}`, {
      status: res.status,
      retryable: res.status === 429 || res.status >= 500,
      body: json,
    });
  }
  const id = json?.data?.id || json?.id;
  if (!id) throw new WavespeedError(`Wavespeed ${slug} returned no prediction id`, { body: json });
  return id;
}

/** One poll. Returns { status: "processing"|"completed"|"failed", outputs, error, raw }. */
export async function wsResult(id) {
  const res = await fetch(`${BASE}/predictions/${id}/result`, {
    headers: { Authorization: `Bearer ${key()}` },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new WavespeedError(`Wavespeed poll failed (${res.status})`, { status: res.status, retryable: res.status === 429 || res.status >= 500, body: json });
  }
  const data = json.data || json;
  const s = String(data.status || "processing").toLowerCase();
  if (s === "completed") return { status: "completed", outputs: Array.isArray(data.outputs) ? data.outputs : [], raw: data };
  if (["failed", "cancelled", "timeout", "deleted"].includes(s)) return { status: "failed", outputs: [], error: data.error || `Provider reported ${s}`, raw: data };
  return { status: "processing", outputs: [], raw: data };
}

/** Poll until terminal. Use only in steps/scripts with generous time budgets. */
export async function wsWait(id, { intervalMs = 3000, timeoutMs = 10 * 60 * 1000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const r = await wsResult(id);
    if (r.status === "completed") return r.outputs;
    if (r.status === "failed") throw new WavespeedError(r.error || "Generation failed", { body: r.raw });
    if (Date.now() - t0 > timeoutMs) throw new WavespeedError("Timed out waiting for Wavespeed", { retryable: true });
    await new Promise((res) => setTimeout(res, intervalMs));
  }
}
