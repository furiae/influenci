import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const GENDERS = ["female", "male", "non-binary"];
const AGES = ["18-24", "25-35", "36-50", "50+"];

function clean(body) {
  const name = String(body.name || "").trim().slice(0, 80);
  const imageUrl = String(body.imageUrl || "").trim();
  const gender = GENDERS.includes(body.gender) ? body.gender : null;
  const ageRange = AGES.includes(body.ageRange) ? body.ageRange : null;
  const notes = body.notes ? String(body.notes).trim().slice(0, 1000) : null;
  return { name, imageUrl, gender, ageRange, notes };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const actors = await prisma.actor.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { creations: true } } },
  });
  return NextResponse.json(actors);
}

export async function POST(req) {
  try {
    const user = await requireUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    const data = clean(await req.json());
    if (!data.name) return NextResponse.json({ error: "Give the actor a name" }, { status: 400 });
    if (!/^https:\/\//.test(data.imageUrl)) return NextResponse.json({ error: "Upload a reference photo first" }, { status: 400 });

    const actor = await prisma.actor.create({ data: { ...data, userId: user.id } });
    return NextResponse.json(actor, { status: 201 });
  } catch (error) {
    console.error("[ACTOR_CREATE_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
