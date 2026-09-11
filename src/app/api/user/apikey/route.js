import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProvider } from "@/lib/providers";

/**
 * Bring-your-own-key management. Keys are stored server-side only; the
 * session exposes which providers have a key, never the key itself.
 */
export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const provider = getProvider(body.provider);
    if (!provider || !provider.allowUserKey) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
    const apiKey = String(body.apiKey || "").trim();
    if (apiKey.length < 8) return NextResponse.json({ error: "That key looks too short" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { apiKeys: true } });
    const apiKeys = { ...((user?.apiKeys && typeof user.apiKeys === "object") ? user.apiKeys : {}), [provider.id]: apiKey };
    await prisma.user.update({ where: { id: session.user.id }, data: { apiKeys } });

    return NextResponse.json({ success: true, hasKeys: Object.fromEntries(Object.keys(apiKeys).map((k) => [k, true])) });
  } catch (error) {
    console.error("[APIKEY_SET_ERROR]", error);
    return NextResponse.json({ error: "Failed to save API key" }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { apiKeys: true } });
    const apiKeys = { ...((user?.apiKeys && typeof user.apiKeys === "object") ? user.apiKeys : {}) };
    if (body.provider) delete apiKeys[body.provider];
    else for (const k of Object.keys(apiKeys)) delete apiKeys[k];
    await prisma.user.update({ where: { id: session.user.id }, data: { apiKeys } });

    return NextResponse.json({ success: true, hasKeys: Object.fromEntries(Object.keys(apiKeys).map((k) => [k, true])) });
  } catch (error) {
    console.error("[APIKEY_DELETE_ERROR]", error);
    return NextResponse.json({ error: "Failed to remove API key" }, { status: 500 });
  }
}
