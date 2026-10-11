import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startChannelImport } from "@/lib/insights/sync";

/** POST { mode?: "import" | "sync" } → start the history import / refresh workflow. */
export async function POST(req, { params }) {
  const { id } = await params;
  const user = await requireUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const channel = await prisma.channel.findFirst({ where: { id, actor: { userId: user.id } }, include: { actor: { select: { importStatus: true, importRunId: true } } } });
  if (!channel) return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (channel.actor.importStatus === "importing" && !body.force) return NextResponse.json({ error: "An import is already running for this brand" }, { status: 409 });
  try {
    const runId = await startChannelImport(id, { mode: body.mode === "sync" ? "sync" : "import" });
    return NextResponse.json({ runId }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
