import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    const creations = await prisma.creation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { id: true, name: true, imageUrl: true } } },
    });
    return NextResponse.json(creations);
  } catch (error) {
    console.error("[CREATIONS_GET_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
