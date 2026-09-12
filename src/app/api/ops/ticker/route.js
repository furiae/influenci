import { NextResponse } from "next/server";
import { authorizeOps } from "@/lib/ops-auth";
import { startTicker, stopTicker, tickerStatus, tickOnce } from "@/lib/scheduler/ticker";

export const maxDuration = 300;

export async function GET(req) {
  const authz = await authorizeOps(req);
  if (!authz.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await tickerStatus());
}

/** POST { action: "start" | "stop" | "tick" } */
export async function POST(req) {
  const authz = await authorizeOps(req);
  if (!authz.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "start") return NextResponse.json(await startTicker());
    if (body.action === "stop") return NextResponse.json(await stopTicker());
    if (body.action === "tick") return NextResponse.json(await tickOnce());
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[OPS_TICKER_ERROR]", err);
    return NextResponse.json({ error: err.message || "Ticker action failed" }, { status: 500 });
  }
}
