import { NextResponse } from "next/server";
import { actingUser } from "@/lib/ops-auth";
import { seedApex } from "@/lib/seed/apex-seed";

export const maxDuration = 120;

/** POST {} → create/refresh the Apex Outdoor Rewards brand from the transcribed screenshots. */
export async function POST(req) {
  const user = await actingUser(req);
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const r = await seedApex(user.id);
    return NextResponse.json(r);
  } catch (err) {
    console.error("[SEED_APEX_ERROR]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
