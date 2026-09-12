import { createHash } from "node:crypto";
import { sign, verify, randomToken } from "@/lib/crypto";

export const STATE_COOKIE = "influenci_oauth";

/** Signed state carried through the provider round-trip (also kept in a cookie). */
export function buildState({ actorId, platform, codeVerifier = null }) {
  return sign({ actorId, platform, nonce: randomToken(12), codeVerifier, iat: Date.now() });
}

export function parseState(state) {
  return verify(state, { maxAgeMs: 15 * 60 * 1000 });
}

export function pkcePair() {
  const codeVerifier = randomToken(48);
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function cookieHeader(value, { maxAge = 900 } = {}) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${STATE_COOKIE}=${encodeURIComponent(value)}; Path=/api/social; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearCookieHeader() {
  return `${STATE_COOKIE}=; Path=/api/social; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readCookie(req) {
  const raw = req.headers.get("cookie") || "";
  const m = raw.split(/;\s*/).find((c) => c.startsWith(`${STATE_COOKIE}=`));
  return m ? decodeURIComponent(m.slice(STATE_COOKIE.length + 1)) : null;
}
