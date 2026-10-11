import { NextResponse } from "next/server";
import { ownedBrand as owned } from "@/lib/accounts";
import { importScreenshots, recordPosts } from "@/lib/insights/screenshots";
import { analyzePending } from "@/lib/insights/analyze";
import { serverAiEnabled, subscriptionHint } from "@/lib/content/ai-mode";

export const maxDuration = 300;

/**
 * POST { urls: [...], platform? }   → Claude reads the screenshots and records the posts
 * POST { posts: [...], platform? }  → already-transcribed posts (MCP connector, scripts)
 */
export async function POST(req, { params }) {
  const { id } = await params;
  const { actor } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const platform = ["facebook", "facebook_group", "instagram", "tiktok", "x", "youtube"].includes(body.platform) ? body.platform : "facebook";
  try {
    if (Array.isArray(body.posts) && body.posts.length) {
      const r = await recordPosts(id, body.posts.slice(0, 200), { source: body.source === "manual" ? "manual" : "screenshot", defaultPlatform: platform });
      return NextResponse.json({ posts: r.ids.length, platforms: r.platforms });
    }
    const urls = (Array.isArray(body.urls) ? body.urls : []).filter((u) => /^https:\/\//.test(u)).slice(0, 40);
    if (!urls.length) return NextResponse.json({ error: "Upload at least one screenshot" }, { status: 400 });
    if (!(await serverAiEnabled())) return NextResponse.json(subscriptionHint("import-screenshots"), { status: 409 });
    const r = await importScreenshots(id, urls, { defaultPlatform: platform });
    if (body.analyze !== false && r.posts) await analyzePending(id, { limit: Math.min(10, r.posts) }).catch(() => {});
    return NextResponse.json(r);
  } catch (err) {
    console.error("[SCREENSHOT_IMPORT_ERROR]", err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
