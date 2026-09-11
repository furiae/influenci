import { NextResponse } from "next/server";
import { authorizeOps } from "@/lib/ops-auth";
import { runPlanner } from "@/lib/scheduler/planner";

export const maxDuration = 300;

/** POST { dayOffset? } → plan today (+ tomorrow) for every active actor. Owner session or OPS_SECRET. */
export async function POST(req) {
  const authz = await authorizeOps(req);
  if (!authz.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const results = await runPlanner({ userId: authz.user?.id ?? null, dayOffset: Number.isInteger(body.dayOffset) ? body.dayOffset : 1 });
    console.log("[OPS_PLANNER]", results);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[OPS_PLANNER_ERROR]", err);
    return NextResponse.json({ error: err.message || "Planner failed" }, { status: 500 });
  }
}
