import { timingSafeEqual } from "node:crypto";
import { requireOwner } from "@/lib/auth";

/**
 * Operations routes accept either the signed-in owner or a bearer OPS_SECRET
 * (for CLI/cron-style triggers). Returns { ok, via } .
 */
export async function authorizeOps(req) {
  const header = req.headers.get("authorization") || "";
  const secret = process.env.OPS_SECRET || "";
  if (secret && header.startsWith("Bearer ")) {
    const given = Buffer.from(header.slice(7));
    const want = Buffer.from(secret);
    if (given.length === want.length && timingSafeEqual(given, want)) return { ok: true, via: "secret" };
  }
  const owner = await requireOwner();
  if (owner) return { ok: true, via: "owner", user: owner };
  return { ok: false };
}
