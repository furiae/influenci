import { prisma } from "@/lib/prisma";
import { mergeBrandProfile } from "@/lib/personas/brand";
import { recordPosts } from "@/lib/insights/screenshots";
import { OUTDOOR_COMPETITORS } from "@/lib/personas/competitors";
import { localTimeToUtc } from "@/lib/time";
import { APEX_BRAND, APEX_POSTS } from "./apex";

function baseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")).replace(/\/$/, "");
}

/**
 * Create (or refresh) the Apex Outdoor Rewards brand for a user from the
 * transcribed screenshots. Idempotent: posts key on (actor, platform, externalId).
 */
export async function seedApex(userId, { competitors = true } = {}) {
  let actor = await prisma.actor.findFirst({ where: { userId, kind: "brand", slug: APEX_BRAND.slug } });
  const brandProfile = mergeBrandProfile(actor?.brandProfile, APEX_BRAND.brandProfile);
  if (!actor) {
    actor = await prisma.actor.create({
      data: {
        userId,
        name: APEX_BRAND.name,
        slug: APEX_BRAND.slug,
        kind: "brand",
        imageUrl: "",
        timezone: APEX_BRAND.timezone,
        brandProfile,
        bible: { category: brandProfile.category },
        defaultClip: { lengthSec: 5, audio: true, mediaType: "image" },
        cadence: { platforms: { instagram: { perDay: 1 }, facebook: { perDay: 1 }, tiktok: { perDay: 0 }, youtube: { perDay: 0 }, pinterest: { perDay: 0 }, x: { perDay: 0 } } },
        autoPublish: false,
      },
    });
  } else {
    await prisma.actor.update({ where: { id: actor.id }, data: { brandProfile, bible: { ...(actor.bible || {}), category: brandProfile.category } } });
  }

  const posts = APEX_POSTS.map((p) => {
    const [ymd, hhmm] = p.postedAt.split("T");
    return {
      platform: "facebook",
      postedAt: localTimeToUtc(ymd, hhmm, APEX_BRAND.timezone).toISOString(),
      caption: p.caption,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      views: 0,
      mediaType: p.mediaType,
      format: p.format,
      thumbnailUrl: p.shot ? `${baseUrl()}/seed/apex/${p.shot}` : null,
      dateText: p.postedAt,
    };
  });
  const r = await recordPosts(actor.id, posts, { source: "screenshot", defaultPlatform: "facebook" });

  let added = 0;
  if (competitors) {
    for (const c of OUTDOOR_COMPETITORS) {
      const row = await prisma.competitor.upsert({
        where: { actorId_platform_handle: { actorId: actor.id, platform: c.platform, handle: c.handle } },
        update: {},
        create: { actorId: actor.id, platform: c.platform, handle: c.handle, notes: "outdoor niche starter" },
      });
      if (Date.now() - new Date(row.createdAt).getTime() < 5000) added += 1;
    }
  }
  await prisma.actor.update({ where: { id: actor.id }, data: { importStatus: "ready", lastImportAt: new Date() } });
  console.log("[SEED_APEX]", actor.id, r.ids.length, "posts", added, "competitors");
  return { actorId: actor.id, posts: r.ids.length, competitorsAdded: added };
}
