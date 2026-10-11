import { prisma } from "@/lib/prisma";
import { scorePost } from "@/lib/benchmarks";
import { screenshotExternalId } from "./screenshots";

/**
 * Posts written by *members* of the brand's own community (its private
 * Facebook group) are not the brand's posts, so they must not enter the
 * brand's 1-10 pool. They are the clearest signal of what the community
 * reacts to, so they are stored as benchmarks under a "community"
 * competitor row and feed the recommender like competitor posts do.
 */
export async function communityCompetitor(actorId) {
  const actor = await prisma.actor.findUnique({ where: { id: actorId }, select: { brandProfile: true, name: true } });
  const g = actor?.brandProfile?.community?.facebookGroup || {};
  const handle = g.name || `${actor?.name || "Brand"} Group`;
  let row = await prisma.competitor.findFirst({ where: { actorId, platform: "facebook_group", notes: { startsWith: "community" } } });
  const data = { displayName: handle, handle, followers: Number(g.members) || null, url: g.url || null, active: true };
  if (!row) row = await prisma.competitor.create({ data: { actorId, platform: "facebook_group", notes: "community: posts by members of the brand's own group (not the brand). Benchmarks of what the community responds to.", ...data } });
  else if (row.handle !== handle || row.followers !== data.followers) row = await prisma.competitor.update({ where: { id: row.id }, data });
  return row;
}

/** Store member posts as benchmarks. Returns { competitorId, recorded }. */
export async function recordCommunityPosts(actorId, posts) {
  if (!posts?.length) return { competitorId: null, recorded: 0 };
  const c = await communityCompetitor(actorId);
  let recorded = 0;
  for (const p of posts) {
    const postedAt = p.postedAt ? new Date(p.postedAt) : new Date();
    if (Number.isNaN(postedAt.getTime())) continue;
    const externalId = p.externalId || screenshotExternalId("facebook_group", postedAt.toISOString(), p.caption || p.mediaDescription || "");
    const data = { caption: [p.caption, p.mediaDescription ? `(${p.mediaDescription})` : ""].filter(Boolean).join(" ").slice(0, 4000), mediaType: p.mediaType || "image", thumbnailUrl: p.thumbnailUrl || null, postedAt, likes: Number(p.likes) || 0, comments: Number(p.comments) || 0, shares: Number(p.shares) || 0, views: Number(p.views) || 0 };
    const score = scorePost(data, c.followers || 0);
    await prisma.benchmarkPost.upsert({ where: { competitorId_externalId: { competitorId: c.id, externalId } }, create: { competitorId: c.id, platform: "facebook_group", externalId, ...data, score }, update: { ...data, score, fetchedAt: new Date() } });
    recorded += 1;
  }
  return { competitorId: c.id, recorded };
}
