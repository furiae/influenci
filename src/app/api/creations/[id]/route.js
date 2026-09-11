import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findModel, getProvider, resolveApiKey, serverKeyFor } from "@/lib/providers";

export const maxDuration = 60;

const ACTIVE = ["processing", "pending", "starting", "queued"];

export async function GET(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

    const { id } = await params;
    let creation = await prisma.creation.findFirst({
      where: { id, userId: session.user.id },
      include: { actor: { select: { id: true, name: true, imageUrl: true } } },
    });
    if (!creation) return new NextResponse("Not Found", { status: 404 });

    // Polling fallback: ask the provider directly (covers missed webhooks and
    // providers that have no webhook at all).
    if (ACTIVE.includes(creation.status) && creation.requestId) {
      const provider = getProvider(creation.provider);
      if (provider?.status) {
        try {
          let apiKey = null;
          if (provider.envKey) {
            if (creation.keySource === "user") {
              const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { apiKeys: true } });
              apiKey = resolveApiKey(provider, user?.apiKeys).apiKey;
            } else {
              apiKey = serverKeyFor(provider);
            }
          }
          const model = findModel(creation.modelId)?.model || null;
          const result = await provider.status({ model, requestId: creation.requestId, apiKey, creation });

          if (result.status === "completed" && result.url) {
            creation = await prisma.creation.update({
              where: { id: creation.id },
              data: { status: "completed", url: result.url, error: null },
              include: { actor: { select: { id: true, name: true, imageUrl: true } } },
            });
          } else if (result.status === "failed") {
            creation = await prisma.creation.update({
              where: { id: creation.id },
              data: { status: "failed", error: result.error || "Generation failed" },
              include: { actor: { select: { id: true, name: true, imageUrl: true } } },
            });
            const spent = Number(creation.meta?.credits || 0);
            if (spent > 0) {
              await prisma.user.update({ where: { id: session.user.id }, data: { credits: { increment: spent } } });
            }
          }
        } catch (pollErr) {
          console.error("[CREATION_POLL_ERROR]", pollErr);
        }
      }
    }

    return NextResponse.json(creation);
  } catch (error) {
    console.error("[CREATION_GET_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
    const { id } = await params;
    const { count } = await prisma.creation.deleteMany({ where: { id, userId: session.user.id } });
    if (!count) return new NextResponse("Not Found", { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CREATION_DELETE_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
