/**
 * Persona bible: the stable description of who an actor is, used verbatim in
 * every prompt so voice and look stay consistent across hundreds of posts.
 */

export const EMPTY_BIBLE = {
  category: "",
  tagline: "",
  bio: "",
  age: null,
  pronouns: "",
  location: "",
  niche: "",
  contentPillars: [],
  toneOfVoice: "",
  catchphrases: [],
  doNots: [],
  audience: "",
  aiDisclosure: "AI-generated character",
  visual: {
    description: "",
    wardrobe: [],
    signatureProps: [],
    settings: [],
    lighting: "",
    cameraStyle: "",
  },
  platformNotes: {},
};

export function mergeBible(base, patch) {
  const a = base && typeof base === "object" ? base : {};
  const b = patch && typeof patch === "object" ? patch : {};
  return {
    ...EMPTY_BIBLE,
    ...a,
    ...b,
    visual: { ...EMPTY_BIBLE.visual, ...(a.visual || {}), ...(b.visual || {}) },
    platformNotes: { ...(a.platformNotes || {}), ...(b.platformNotes || {}) },
  };
}

function list(arr) {
  return Array.isArray(arr) && arr.length ? arr.map((x) => `- ${x}`).join("\n") : "- (none)";
}

/** Stable system prompt for content generation. Keep deterministic for prompt caching. */
export function bibleToSystemPrompt(actor) {
  const b = mergeBible(actor.bible, {});
  const species = actor.kind === "pet" ? "a pet character (an animal, not a person)" : "a human-looking character";
  return `You write social media content for "${actor.name}", ${species} who is an AI-generated influencer persona.

IDENTITY
- Tagline: ${b.tagline || "(none)"}
- Bio: ${b.bio || "(none)"}
- Age: ${b.age ?? "(n/a)"} · Pronouns: ${b.pronouns || "(n/a)"} · Location: ${b.location || "(n/a)"}
- Niche: ${b.niche || "(none)"}
- Audience: ${b.audience || "(general)"}

CONTENT PILLARS
${list(b.contentPillars)}

VOICE
- Tone: ${b.toneOfVoice || "friendly, upbeat"}
- Catchphrases (use sparingly, never in every post):
${list(b.catchphrases)}

NEVER
${list(b.doNots)}
- Never claim to be a real person, never give medical, legal or financial advice, never fabricate real brands' endorsements.

LOOK (for scene and keyframe prompts)
- ${b.visual?.description || actor.canonicalPrompt || "(see canonical prompt)"}
- Wardrobe options: ${(b.visual?.wardrobe || []).join("; ") || "(any)"}
- Signature props: ${(b.visual?.signatureProps || []).join("; ") || "(none)"}
- Usual settings: ${(b.visual?.settings || []).join("; ") || "(any)"}
- Lighting: ${b.visual?.lighting || "natural"} · Camera: ${b.visual?.cameraStyle || "handheld vertical 9:16"}

DISCLOSURE
- Every caption ends with a short, natural disclosure that this is an AI character, e.g. "(${b.aiDisclosure || "AI-generated character"})". Do not hide it.

PLATFORM NOTES
${Object.entries(b.platformNotes || {}).map(([k, v]) => `- ${k}: ${v}`).join("\n") || "- (none)"}

Write like a real creator: specific, sensory, short sentences, no corporate tone, no hashtag spam.`;
}
