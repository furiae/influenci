import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownedBrand as owned } from "@/lib/accounts";
import { renderCardToBlob, TEMPLATES } from "@/lib/render/cards";
import { createPostFromRecommendation } from "@/lib/insights/post-from-rec";

export const maxDuration = 60;

/** GET → the card templates and their fields. */
export async function GET(_req, { params }) {
  const { id } = await params;
  const { actor } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json({ templates: Object.entries(TEMPLATES).map(([key, t]) => ({ key, ...t })) });
}

/**
 * POST { template, fields, photoUrl }                       → { url } preview (free; no AI)
 * POST { template, fields, photoUrl, create: { caption, hashtags?, platforms?, scheduledAt?, title? } }
 *   → renders, stores a Recommendation + brand Post whose keyframe is the card; returns { url, postId, ... }
 */
export async function POST(req, { params }) {
  const { id } = await params;
  const { actor, user } = await owned(id);
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const photoUrl = typeof body.photoUrl === "string" && /^https:\/\//.test(body.photoUrl) ? body.photoUrl : null;
    const card = await renderCardToBlob({ actor, template: body.template, fields: body.fields || {}, photoUrl });
    if (!body.create) return NextResponse.json({ url: card.url, template: card.template, fields: card.fields });
    const c = body.create;
    if (!c.caption) return NextResponse.json({ error: "A caption is required to create the post" }, { status: 400 });
    const platforms = (Array.isArray(c.platforms) ? c.platforms : ["facebook"]).filter((p) => ["instagram", "facebook"].includes(p));
    const title = String(c.title || card.fields.headline || card.fields.question || `${TEMPLATES[card.template].label}: ${card.fields.name || ""}`).slice(0, 120);
    const rec = await prisma.recommendation.create({ data: { actorId: actor.id, kind: "post", status: "saved", platforms, format: "graphic", title, concept: String(c.caption).slice(0, 2000), hook: title, caption: String(c.caption).slice(0, 5000), hashtags: (Array.isArray(c.hashtags) ? c.hashtags : []).map((h) => String(h).replace(/^#/, "")).slice(0, 30), visualBrief: { subject: title, template: card.template, fields: card.fields, photoUrl, cardUrl: card.url }, basedOn: { source: "card_maker" } } });
    const post = await createPostFromRecommendation(rec, { platforms, date: c.scheduledAt, userId: user?.id });
    return NextResponse.json({ url: card.url, postId: post.id, status: post.status, planDate: post.planDate, calendar: `/calendar?post=${post.id}` });
  } catch (err) {
    console.error("[CARD_ERROR]", err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
