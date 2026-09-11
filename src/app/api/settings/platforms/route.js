import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { listPlatformApps, savePlatformApp } from "@/lib/social/apps";

export async function GET() {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Owner only" }, { status: 403 });
  return NextResponse.json({ apps: await listPlatformApps() });
}

export async function PUT(req) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Owner only" }, { status: 403 });
  try {
    const body = await req.json();
    const { appKey, clientId, clientSecret, extra, reviewStatus } = body || {};
    await savePlatformApp(appKey, { clientId, clientSecret, extra, reviewStatus });
    return NextResponse.json({ apps: await listPlatformApps() });
  } catch (err) {
    console.error("[PLATFORM_APP_SAVE_ERROR]", err);
    return NextResponse.json({ error: err.message || "Failed to save" }, { status: 400 });
  }
}
