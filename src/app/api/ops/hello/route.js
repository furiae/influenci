import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { authorizeOps } from "@/lib/ops-auth";
import { helloWorkflow } from "@/workflows/hello";

/** Owner or OPS_SECRET: start the smoke-test workflow. */
export async function POST(req) {
  const authz = await authorizeOps(req);
  if (!authz.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const run = await start(helloWorkflow, [String(body.label || "hello")]);
    console.log("[OPS_HELLO] started", run.runId, "via", authz.via);
    return NextResponse.json({ runId: run.runId });
  } catch (err) {
    console.error("[OPS_HELLO_ERROR]", err);
    return NextResponse.json({ error: err.message || "Failed to start workflow" }, { status: 500 });
  }
}
