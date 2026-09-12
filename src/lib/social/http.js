import { PublishError } from "./contract";

/**
 * fetch wrapper that parses JSON and maps HTTP failures to PublishError with
 * a retryable flag (429 / 5xx / network).
 */
export async function apiFetch(url, { platform = "unknown", parse = "json", okStatuses, ...opts } = {}) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    throw new PublishError(`${platform}: network error ${err.message}`, { platform, retryable: true });
  }
  const text = await res.text();
  let body = text;
  if (parse === "json") {
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  }
  const ok = okStatuses ? okStatuses.includes(res.status) : res.ok;
  if (!ok) {
    const msg = body?.error?.message || body?.error_description || body?.message || body?.error?.error_user_msg || body?.detail || (typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body).slice(0, 300));
    throw new PublishError(`${platform}: HTTP ${res.status} ${msg}`, {
      platform,
      status: res.status,
      code: body?.error?.code || body?.error?.type || body?.code,
      retryable: res.status === 429 || res.status >= 500,
      body,
    });
  }
  return { body, headers: res.headers, status: res.status };
}

export function formBody(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null) p.set(k, String(v));
  return p;
}
