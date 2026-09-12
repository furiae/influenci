import { NextResponse } from "next/server";
import { actingUser } from "@/lib/ops-auth";
import { prisma } from "@/lib/prisma";
import { analyzeBenchmark } from "@/lib/benchmarks";

export const maxDuration = 120;

/** POST → watch this benchmark video with Gemini and store the breakdown. */
export async function POST(req, { params }) {
  const { id } = await params;
  const user = await actingUser(req);
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const post = await prisma.benchmarkPost.findFirst({ where: { id, competitor: { actor: { userId: user.id } } } });
  if (!post) return new NextResponse("Not Found", { status: 404 });
  try {
    const analysis = await analyzeBenchmark(id);
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("[BENCHMARK_ANALYZE_ERROR]", err);
    return NextResponse.json({ error: err.message || "Analysis failed" }, { status: 400 });
  }
}
