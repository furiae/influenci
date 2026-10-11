/**
 * Brand profile: the stable description of a REAL business account we manage
 * (as opposed to an AI persona). Lives in Actor.brandProfile for actors with
 * kind = "brand" and feeds every brand prompt.
 */

export const EMPTY_BRAND_PROFILE = {
  category: "",
  website: "",
  oneLiner: "",
  description: "",
  products: [],
  campaigns: [], // [{ name, description, season, cta, url }]
  audience: "",
  voice: "",
  pillars: [],
  doNots: [],
  ctas: [],
  hashtagSets: { core: [], seasonal: [] },
  links: { facebook: "", instagram: "", website: "" },
  seasonality: [], // extra brand moments: [{ name, from: "MM-DD", to: "MM-DD", note }]
  notes: "",
};

export function mergeBrandProfile(base, patch) {
  const a = base && typeof base === "object" ? base : {};
  const b = patch && typeof patch === "object" ? patch : {};
  return {
    ...EMPTY_BRAND_PROFILE,
    ...a,
    ...b,
    hashtagSets: { ...EMPTY_BRAND_PROFILE.hashtagSets, ...(a.hashtagSets || {}), ...(b.hashtagSets || {}) },
    links: { ...EMPTY_BRAND_PROFILE.links, ...(a.links || {}), ...(b.links || {}) },
  };
}

function list(arr) {
  return Array.isArray(arr) && arr.length ? arr.map((x) => `- ${typeof x === "string" ? x : x?.name ? `${x.name}${x.description ? `: ${x.description}` : ""}` : JSON.stringify(x)}`).join("\n") : "- (none)";
}

/** Caption-style block from the learned design system (if any). */
export function captionStyleBlock(designSystem) {
  const c = designSystem?.captionStyle;
  if (!c) return "";
  return `
CAPTION STYLE (learned from the account's best posts)
- Typical length: ${c.length || "short"}
- Structure: ${c.structure || "hook, one or two lines, CTA"}
- Openers that work: ${(c.openers || []).join(" | ") || "(none)"}
- Emoji: ${c.emoji || "sparingly"}
- CTA patterns: ${(c.ctaPatterns || []).join(" | ") || "(none)"}
- Core hashtags: ${(c.hashtagSets?.core || []).join(" ") || "(none)"}`;
}

/** Stable system prompt for a brand account. Keep deterministic for prompt caching. */
export function brandToSystemPrompt(actor) {
  const b = mergeBrandProfile(actor.brandProfile, {});
  return `You write social media content for "${actor.name}", a real brand whose official accounts we manage. You are the brand's in-house social media manager.

BRAND
- Category: ${b.category || "(none)"}
- One-liner: ${b.oneLiner || "(none)"}
- About: ${b.description || "(none)"}
- Website: ${b.website || b.links?.website || "(none)"}
- Audience: ${b.audience || "(general)"}

PRODUCTS / OFFERS
${list(b.products)}

CAMPAIGNS / PROGRAMS
${list(b.campaigns)}

CONTENT PILLARS
${list(b.pillars)}

VOICE
- ${b.voice || "confident, friendly, plain-spoken; speaks like a fellow hunter/angler, not a corporation"}

CALLS TO ACTION THAT FIT THIS BRAND
${list(b.ctas)}

NEVER
${list(b.doNots)}
- Never invent prizes, dates, rules, prices or partnerships. Never promise outcomes. Never give legal or safety advice beyond common sense. Follow sweepstakes rules: mention "no purchase necessary" and the official rules link when a post is about a giveaway or contest.
- Do not mention AI or that content is generated. No AI disclosure for a brand account.
${captionStyleBlock(actor.designSystem)}

Write like the brand's best posts: specific, visual, short sentences, one idea per post, no corporate filler, no hashtag spam.`;
}
