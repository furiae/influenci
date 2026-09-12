import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConnector } from "@/lib/social";
import { getFreshToken } from "@/lib/social/tokens";

async function owned(req, id) {
  const user = await requireUser();
  if (!user) return null;
  return prisma.channel.findFirst({ where: { id, actor: { userId: user.id } } });
}

/** POST ?action=probe → verify the token still works (refreshing if needed). */
export async function POST(req, { params }) {
  const { id } = await params;
  const channel = await owned(req, id);
  if (!channel) return new NextResponse("Unauthorized", { status: 401 });
  const connector = getConnector(channel.platform);
  if (!connector) return NextResponse.json({ error: "No connector" }, { status: 400 });
  try {
    const token = await getFreshToken(channel, connector);
    const r = await connector.probe({ channel, token });
    const updated = await prisma.channel.update({
      where: { id },
      data: { status: r.ok ? "connected" : "error", lastError: r.ok ? null : r.error, lastCheckedAt: new Date(), ...(r.handle ? { handle: r.handle } : {}) },
    });
    return NextResponse.json({ ok: r.ok, status: updated.status, error: r.error || null });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}

/** PATCH { config } → merge platform config (board id, defaults…). */
export async function PATCH(req, { params }) {
  const { id } = await params;
  const channel = await owned(req, id);
  if (!channel) return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const config = { ...(channel.config || {}), ...(body.config || {}) };
  const updated = await prisma.channel.update({ where: { id }, data: { config } });
  return NextResponse.json({ id: updated.id, config: updated.config });
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const channel = await owned(req, id);
  if (!channel) return new NextResponse("Unauthorized", { status: 401 });
  const connector = getConnector(channel.platform);
  if (connector?.revoke) {
    try { await connector.revoke({ channel, token: await getFreshToken(channel, connector) }); } catch (err) { console.warn("[CHANNEL_REVOKE]", err.message); }
  }
  await prisma.channel.delete({ where: { id } });
  console.log("[CHANNEL_DELETED]", channel.platform, channel.handle);
  return NextResponse.json({ success: true });
}
