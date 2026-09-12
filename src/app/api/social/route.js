import { NextResponse } from "next/server";
import { implementedPlatforms } from "@/lib/social";

/** Which platform connectors exist in this build. */
export async function GET() {
  return NextResponse.json({ implemented: implementedPlatforms() });
}
