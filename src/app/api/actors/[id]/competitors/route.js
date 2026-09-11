import { NextResponse } from "next/server";
import { actingUser } from "@/lib/ops-auth";
import { prisma } from "@/lib/prisma";
import { isPlatform } from "@/lib/platforms";
import { refreshActorCompetitors, topBenchmarks } from "@/lib/benchmarks";
import { FETCHERS } from "@/lib/benchmarks/fetchers";

export const maxDuration = 120;

async function ownedActor(req, id) {
  const user = await actingUser(req);
  if (!user) return null;
  return prisma.actor.findFirst({ where: { id, userId: user.id } });
}

/** GET → competitors + top benchmark posts. */
export async function GET(req, { params }) {
  const { id } = await params;
  const actor = await ownedActor(req, id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  const competitors = await prisma.competitor.findMany({ where: { actorId: id }, orderBy: [{ platform: "asc" }, { createdAt: "asc" }], include: { _count: { select: { posts: true } } } });
  const top = await topBenchmarks(id, { limit: 20 });
  const support = Object.fromEntries(Object.entries(FETCHERS).map(([k, v]) => [k, { supported: Boolean(v.fn), needs: v.needs }]));
  return NextResponse.json({ competitors, top, support });
}

/** POST { platform, handle, notes? } → add; POST { action: "refresh" } → fetch all. */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const actor = await ownedActor(req, id);
    if (!actor) return new NextResponse("Unauthorized", { status: 401 });
    const body = await req.json().catch(() => ({}));

    if (body.action === "refresh") {
      const results = await refreshActorCompetitors(id);
      return NextResponse.json({ results, top: await topBenchmarks(id, { limit: 20 }) });
    }

    const platform = String(body.platform || "").toLowerCase();
    const handle = String(body.handle || "").trim().replace(/^@/, "").replace(/^https?:\/\/[^/]+\//, "").replace(/\/.*$/, "");
    if (!isPlatform(platform)) return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
    if (!handle) return NextResponse.json({ error: "Enter a handle" }, { status: 400 });
    const competitor = await prisma.competitor.upsert({
      where: { actorId_platform_handle: { actorId: id, platform, handle } },
      update: { active: true, notes: body.notes ?? undefined },
      create: { actorId: id, platform, handle, notes: body.notes || null },
    });
    return NextResponse.json(competitor, { status: 201 });
  } catch (error) {
    console.error("[COMPETITOR_ERROR]", error);
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
