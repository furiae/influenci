import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const GENDERS = ["female", "male", "non-binary"];
const AGES = ["18-24", "25-35", "36-50", "50+"];

export async function GET(req, { params }) {
  const user = await requireUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const actor = await prisma.actor.findFirst({
    where: { id, userId: user.id },
    include: { creations: { orderBy: { createdAt: "desc" }, take: 24 } },
  });
  if (!actor) return new NextResponse("Not Found", { status: 404 });
  return NextResponse.json(actor);
}

export async function PATCH(req, { params }) {
  try {
    const user = await requireUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const { id } = await params;
    const body = await req.json();

    const data = {};
    if (body.name !== undefined) data.name = String(body.name).trim().slice(0, 80);
    if (body.imageUrl !== undefined && /^https:\/\//.test(body.imageUrl)) data.imageUrl = body.imageUrl;
    if (body.gender !== undefined) data.gender = GENDERS.includes(body.gender) ? body.gender : null;
    if (body.ageRange !== undefined) data.ageRange = AGES.includes(body.ageRange) ? body.ageRange : null;
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim().slice(0, 1000) : null;
    if (data.name === "") return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });

    const { count } = await prisma.actor.updateMany({ where: { id, userId: user.id }, data });
    if (!count) return new NextResponse("Not Found", { status: 404 });
    const actor = await prisma.actor.findUnique({ where: { id } });
    return NextResponse.json(actor);
  } catch (error) {
    console.error("[ACTOR_UPDATE_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const user = await requireUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const { count } = await prisma.actor.deleteMany({ where: { id, userId: user.id } });
  if (!count) return new NextResponse("Not Found", { status: 404 });
  return NextResponse.json({ success: true });
}
