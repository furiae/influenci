import { NextResponse } from "next/server";
import { actingUser } from "@/lib/ops-auth";
import { prisma } from "@/lib/prisma";
import { planActorDay } from "@/lib/scheduler/planner";
import { todayIn, addDays } from "@/lib/time";

export const maxDuration = 120;

/** POST { date?: "YYYY-MM-DD", videosPerDay? } → plan that day (default tomorrow) and start renders. */
export async function POST(req, { params }) {
  try {
    const user = await actingUser(req);
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const { id } = await params;
    const actor = await prisma.actor.findFirst({ where: { id, userId: user.id } });
    if (!actor) return new NextResponse("Not Found", { status: 404 });
    if (!actor.imageUrl) return NextResponse.json({ error: "Upload a main reference photo first." }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const tz = actor.timezone || "America/New_York";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : addDays(todayIn(tz), 1);
    const result = await planActorDay(actor, date, { videosPerDay: body.videosPerDay });
    console.log("[PLAN_ACTOR_DAY]", actor.name, date, result);
    return NextResponse.json({ date, ...result });
  } catch (error) {
    console.error("[PLAN_ROUTE_ERROR]", error);
    return NextResponse.json({ error: error.message || "Planning failed" }, { status: 500 });
  }
}
