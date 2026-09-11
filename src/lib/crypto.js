import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Symmetric encryption for stored OAuth tokens and API keys.
 * TOKEN_ENCRYPTION_KEY is 32 random bytes, base64 (`openssl rand -base64 32`).
 * Ciphertext format: "v1.<iv>.<tag>.<data>" (base64url). Rotate by adding a
 * "v2" key and keeping the old one under TOKEN_ENCRYPTION_KEY_PREV.
 */

const KEYS = {
  v1: process.env.TOKEN_ENCRYPTION_KEY ? Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, "base64") : null,
  v0: process.env.TOKEN_ENCRYPTION_KEY_PREV ? Buffer.from(process.env.TOKEN_ENCRYPTION_KEY_PREV, "base64") : null,
};
const CURRENT = "v1";

function key(version = CURRENT) {
  const k = KEYS[version];
  if (!k || k.length !== 32) throw new Error(`TOKEN_ENCRYPTION_KEY (${version}) is missing or not 32 bytes`);
  return k;
}

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => Buffer.from(s, "base64url");

export function encrypt(plain) {
  if (plain == null) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return [CURRENT, b64u(iv), b64u(cipher.getAuthTag()), b64u(data)].join(".");
}

export function decrypt(token) {
  if (token == null) return null;
  const [version, iv, tag, data] = String(token).split(".");
  if (!version || !iv || !tag || !data) throw new Error("Malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(version), unb64u(iv));
  decipher.setAuthTag(unb64u(tag));
  return Buffer.concat([decipher.update(unb64u(data)), decipher.final()]).toString("utf8");
}

export function isEncrypted(value) {
  return typeof value === "string" && /^v\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(value);
}

/** HMAC-signed JSON, for OAuth state that round-trips through a browser. */
export function sign(obj) {
  const body = b64u(JSON.stringify(obj));
  const mac = createHmac("sha256", key()).update(body).digest();
  return `${body}.${b64u(mac)}`;
}

export function verify(signed, { maxAgeMs = 15 * 60 * 1000 } = {}) {
  const [body, mac] = String(signed || "").split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", key()).update(body).digest();
  const given = unb64u(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const obj = JSON.parse(unb64u(body).toString("utf8"));
  if (obj?.iat && Date.now() - obj.iat > maxAgeMs) return null;
  return obj;
}

/** Random URL-safe token (OAuth state nonce, PKCE verifier). */
export function randomToken(bytes = 32) {
  return b64u(randomBytes(bytes));
}
