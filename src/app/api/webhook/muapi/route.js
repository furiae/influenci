import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import muapi from "@/lib/providers/muapi";

/**
 * MUAPI completion callback. Protected by a shared secret in the query string
 * (MUAPI_WEBHOOK_SECRET); without it anyone who guessed a request id could
 * inject a video URL into a user's gallery.
 */
export async function POST(req) {
  try {
    const secret = process.env.MUAPI_WEBHOOK_SECRET;
    if (secret) {
      const given = new URL(req.url).searchParams.get("secret");
      if (given !== secret) return new NextResponse("Unauthorized", { status: 401 });
    }

    const data = await req.json();
    const requestId = data.id || data.request_id;
    if (!requestId) return NextResponse.json({ error: "Missing request id" }, { status: 400 });

    const creation = await prisma.creation.findUnique({
      where: { provider_requestId: { provider: "muapi", requestId } },
    });
    if (!creation) return NextResponse.json({ error: "Creation not found" }, { status: 404 });

    const result = muapi.parseResult(data);
    if (result.status === "completed") {
      await prisma.creation.update({ where: { id: creation.id }, data: { status: "completed", url: result.url, error: null } });
    } else if (result.status === "failed") {
      await prisma.creation.update({ where: { id: creation.id }, data: { status: "failed", error: result.error } });
      const spent = Number(creation.meta?.credits || 0);
      if (spent > 0 && creation.status !== "failed") {
        await prisma.user.update({ where: { id: creation.userId }, data: { credits: { increment: spent } } });
      }
    } else if (data.status && data.status !== creation.status) {
      await prisma.creation.update({ where: { id: creation.id }, data: { status: String(data.status).toLowerCase() } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[MUAPI_WEBHOOK_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
