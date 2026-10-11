import { NextResponse } from "next/server";
import { requireUser, requireOwner } from "@/lib/auth";
import { getAiMode, setAiMode, connectorUrl } from "@/lib/content/ai-mode";
import { imageSettingsView, setImageSettings } from "@/lib/render/image-providers";

async function view() {
  return { mode: await getAiMode(), connector: connectorUrl(), hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY), image: await imageSettingsView() };
}

/** GET → { mode, connector, hasApiKey, image } (any signed-in user; the tabs use it for hints). */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await view());
}

/**
 * PUT { mode?: "api" | "subscription", image?: { provider?, hfToken?, gpuEndpoint?, gpuToken? } } (owner only).
 * Blank token strings clear the stored token; omitted fields are left as they are.
 */
export async function PUT(req) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Owner only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body.mode !== undefined) {
    if (!["api", "subscription"].includes(body.mode)) return NextResponse.json({ error: "mode must be 'api' or 'subscription'" }, { status: 400 });
    if (body.mode === "api" && !process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Set ANTHROPIC_API_KEY on the server before switching to API mode" }, { status: 400 });
    await setAiMode(body.mode);
  }
  if (body.image && typeof body.image === "object") {
    const { provider, hfToken, gpuEndpoint, gpuToken } = body.image;
    if (provider === "wavespeed" && !process.env.WAVESPEED_API_KEY) return NextResponse.json({ error: "Set WAVESPEED_API_KEY on the server before choosing Wavespeed" }, { status: 400 });
    try {
      await setImageSettings({ provider, hfToken, gpuEndpoint, gpuToken });
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }
  return NextResponse.json(await view());
}
