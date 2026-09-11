import { NextResponse } from "next/server";
import { requireUser, publicUser } from "@/lib/auth";

export async function GET() {
  const user = await requireUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(publicUser(user));
}
