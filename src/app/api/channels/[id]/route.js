import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConnector } from "@/lib/social";
import { getFreshToken } from "@/lib/social/tokens";
import { encrypt } from "@/lib/crypto";

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
      data: {
        status: r.ok ? "connected" : "error",
        lastError: r.ok ? null : r.error,
        lastCheckedAt: new Date(),
        ...(r.handle ? { handle: r.handle } : {}),
        ...(r.followers != null ? { followers: r.followers } : {}),
        ...(r.following != null ? { following: r.following } : {}),
        ...(r.mediaCount != null ? { mediaCount: r.mediaCount } : {}),
      },
    });
    return NextResponse.json({ ok: r.ok, status: updated.status, error: r.error || null });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}

/** PATCH { config } → merge platform config; PATCH { pageId } → switch a Meta channel pair to another Page from the same login. */
export async function PATCH(req, { params }) {
  const { id } = await params;
  const channel = await owned(req, id);
  if (!channel) return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.pageId && ["facebook", "instagram"].includes(channel.platform)) {
    try {
      const { pageFromConfig, accountsForPage } = await import("@/lib/social/meta");
      const page = await pageFromConfig(channel.config, String(body.pageId));
      if (!page) return NextResponse.json({ error: "That Page is not available on the stored login; reconnect Meta." }, { status: 400 });
      const shared = { user: channel.config?.user, userTokenEnc: channel.config?.userTokenEnc, availablePages: channel.config?.availablePages, pagesWithTokens: channel.config?.pagesWithTokens };
      const saved = [];
      for (const acc of accountsForPage(page, shared)) {
        const previous = await prisma.channel.findUnique({ where: { actorId_platform: { actorId: channel.actorId, platform: acc.platform } } });
        const data = { externalId: acc.externalId, handle: acc.handle, displayName: acc.displayName, avatarUrl: acc.avatarUrl, accessTokenEnc: encrypt(acc.accessToken), tokenExpiresAt: null, status: "connected", lastError: null, config: acc.config, followers: acc.config.followers ?? null, lastSyncedAt: null, syncCursor: null };
        const row = await prisma.channel.upsert({ where: { actorId_platform: { actorId: channel.actorId, platform: acc.platform } }, update: data, create: { actorId: channel.actorId, platform: acc.platform, scopes: channel.scopes, ...data } });
        // A different account's history must not stay attached to this channel.
        if (previous && previous.externalId !== acc.externalId) await prisma.channelPost.deleteMany({ where: { channelId: row.id } });
        saved.push({ id: row.id, platform: row.platform, handle: row.handle });
      }
      return NextResponse.json({ switched: saved });
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }
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
