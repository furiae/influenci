import { prisma } from "@/lib/prisma";
import { generateStructured, usageCents } from "./claude";
import { BrandProfileSchema, GiveawayCheckSchema } from "./schemas";
import { mergeBrandProfile } from "@/lib/personas/brand";

/** Draft a brand profile from a few facts plus (when imported) the account's own captions. */
export async function generateBrandProfile({ actorId, name, website, notes, links }) {
  const samples = actorId
    ? await prisma.channelPost.findMany({ where: { actorId, caption: { not: "" } }, orderBy: [{ score: "desc" }, { postedAt: "desc" }], take: 25, select: { platform: true, caption: true, score: true } })
    : [];
  const system = "You are a brand strategist writing the working brief for a brand's social media team. Be concrete, use the brand's own words where samples are given, and never invent programs, prizes or claims that are not supported by the inputs. Output only the requested JSON.";
  const user = `Brand: ${name}
Website: ${website || links?.website || "(unknown)"}
Facebook: ${links?.facebook || "(unknown)"} · Instagram: ${links?.instagram || "(unknown)"}
Owner notes: ${notes || "(none)"}
${samples.length ? `\nSAMPLE CAPTIONS FROM THE ACCOUNT (best-scoring first):\n${samples.map((s, i) => `${i + 1}. [${s.platform}${s.score ? ` ${s.score}/10` : ""}] ${s.caption.replace(/\s+/g, " ").slice(0, 300)}`).join("\n")}` : ""}

Write the brand profile.`;
  const { data, usage } = await generateStructured({ system, user, schema: BrandProfileSchema, effort: "medium", maxTokens: 4000 });
  return { profile: mergeBrandProfile(null, { ...data, website: website || links?.website || "", links: links || {} }), costCents: usageCents(usage) };
}

/** Sweepstakes / promotion compliance check for a caption. */
export async function checkGiveawayCaption({ actor, caption, platform }) {
  const system = "You review social captions for sweepstakes and promotion compliance in the United States (no purchase necessary, official rules link, eligibility, end date, platform promotion guidelines: no 'share on your timeline to enter', no inaccurate tagging, release of Instagram/Facebook). Output only the requested JSON.";
  const user = `Brand: ${actor.name}. Platform: ${platform}.\nCaption:\n${caption}\n\nIs this a promotion/giveaway post? If so, list concrete issues and the smallest fix.`;
  const { data, usage } = await generateStructured({ system, user, schema: GiveawayCheckSchema, effort: "low", maxTokens: 1200 });
  return { ...data, costCents: usageCents(usage) };
}
