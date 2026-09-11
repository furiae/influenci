import { NextResponse } from "next/server";
import { listModels, DEFAULT_PROVIDER } from "@/lib/providers";

/** Public, secret-free model catalog for the Ad Builder. */
export async function GET() {
  return NextResponse.json({ defaultProvider: DEFAULT_PROVIDER, providers: listModels() });
}
