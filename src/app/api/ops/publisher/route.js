import { NextResponse } from "next/server";
import { authorizeOps } from "@/lib/ops-auth";
import { runPublisher } from "@/lib/scheduler/publisher";
import { runPoller } from "@/lib/scheduler/poller";

export const maxDuration = 120;

/** POST { poller?: boolean } → run the publisher (and optionally the poller) now. */
export async function POST(req) {
  const authz = await authorizeOps(req);
  if (!authz.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const publisher = await runPublisher();
    const poller = body.poller ? await runPoller() : undefined;
    console.log("[OPS_PUBLISHER]", publisher);
    return NextResponse.json({ publisher, poller });
  } catch (err) {
    console.error("[OPS_PUBLISHER_ERROR]", err);
    return NextResponse.json({ error: err.message || "Publisher failed" }, { status: 500 });
  }
}
