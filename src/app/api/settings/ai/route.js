import { NextResponse } from "next/server";
import { requireUser, requireOwner } from "@/lib/auth";
import { getAiMode, setAiMode, connectorUrl } from "@/lib/content/ai-mode";

async function view() {
  return { mode: await getAiMode(), connector: connectorUrl(), hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY) };
}

/** GET → { mode, connector, hasApiKey } (any signed-in user; the tabs use it for hints). */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await view());
}

/** PUT { mode: "api" | "subscription" } (owner only). */
export async function PUT(req) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Owner only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!["api", "subscription"].includes(body.mode)) return NextResponse.json({ error: "mode must be 'api' or 'subscription'" }, { status: 400 });
  if (body.mode === "api" && !process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Set ANTHROPIC_API_KEY on the server before switching to API mode" }, { status: 400 });
  await setAiMode(body.mode);
  return NextResponse.json(await view());
}
