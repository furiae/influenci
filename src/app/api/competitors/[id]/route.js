import { NextResponse } from "next/server";
import { actingUser } from "@/lib/ops-auth";
import { prisma } from "@/lib/prisma";
import { refreshCompetitor, instagramContext } from "@/lib/benchmarks";

export const maxDuration = 60;

async function owned(req, id) {
  const user = await actingUser(req);
  if (!user) return null;
  return prisma.competitor.findFirst({ where: { id, actor: { userId: user.id } } });
}

/** POST → refresh this competitor now. */
export async function POST(req, { params }) {
  const { id } = await params;
  const c = await owned(req, id);
  if (!c) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const ctx = c.platform === "instagram" ? await instagramContext(c.actorId) : {};
    const r = await refreshCompetitor(id, ctx);
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 400 });
  }
}

/** PATCH { active?, notes? } */
export async function PATCH(req, { params }) {
  const { id } = await params;
  const c = await owned(req, id);
  if (!c) return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const data = {};
  if (body.active !== undefined) data.active = Boolean(body.active);
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).slice(0, 1000) : null;
  return NextResponse.json(await prisma.competitor.update({ where: { id }, data }));
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const c = await owned(req, id);
  if (!c) return new NextResponse("Unauthorized", { status: 401 });
  await prisma.competitor.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
