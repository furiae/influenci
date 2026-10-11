import { z } from "zod";

export const IdeasSchema = z.object({
  ideas: z.array(
    z.object({
      idea: z.string().describe("One-sentence concept for a short vertical video"),
      pillar: z.string().describe("Which content pillar it serves"),
      hook: z.string().describe("The first line spoken or shown, under 12 words"),
    })
  ),
});

export const ScriptSchema = z.object({
  hook: z.string(),
  scene: z.string().describe("Where we are and what is in frame, one sentence"),
  action: z.string().describe("What the character does during the clip, one sentence"),
  dialogue: z.string().describe("What the character says on camera; empty string for pets"),
  onScreenText: z.string().describe("Optional short on-screen text, or empty string"),
  keyframePrompt: z.string().describe("Image prompt for the first frame: setting, wardrobe, pose, expression. Do NOT restate the face; the system adds identity."),
  motionPrompt: z.string().describe("Video prompt: movement, camera, energy; no appearance details"),
  sound: z.string().describe("Ambient sound or music mood for the clip"),
  wardrobe: z.string().describe("Outfit for this clip, chosen from the persona's wardrobe"),
  durationSec: z.number().int().min(5).max(10),
});

const captionBase = {
  caption: z.string(),
  hashtags: z.array(z.string()),
};

export const CaptionsSchema = z.object({
  instagram: z.object(captionBase),
  facebook: z.object({ ...captionBase, title: z.string() }),
  tiktok: z.object(captionBase),
  youtube: z.object({ title: z.string(), description: z.string(), hashtags: z.array(z.string()) }),
  pinterest: z.object({ title: z.string(), description: z.string(), hashtags: z.array(z.string()) }),
  x: z.object({ text: z.string() }),
});

export const IdentityQaSchema = z.object({
  sameIdentity: z.number().min(0).max(1).describe("Probability the candidate shows the same individual as the reference"),
  issues: z.array(z.string()).describe("Concrete mismatches, e.g. 'eye color differs', 'missing chest patch'"),
  usable: z.boolean().describe("Whether the image is clean enough to animate (no artifacts, text, extra limbs)"),
});

export const BibleSchema = z.object({
  tagline: z.string(),
  bio: z.string(),
  age: z.number().nullable(),
  pronouns: z.string(),
  location: z.string(),
  niche: z.string(),
  contentPillars: z.array(z.string()).min(3).max(7),
  toneOfVoice: z.string(),
  catchphrases: z.array(z.string()).max(4),
  doNots: z.array(z.string()).min(2),
  audience: z.string(),
  aiDisclosure: z.string(),
  visual: z.object({
    description: z.string(),
    wardrobe: z.array(z.string()),
    signatureProps: z.array(z.string()),
    settings: z.array(z.string()),
    lighting: z.string(),
    cameraStyle: z.string(),
  }),
  canonicalPrompt: z.string().describe("One dense sentence describing the exact look, usable verbatim as an image prompt"),
});

/* ---------- Brand accounts ---------- */

export const BrandProfileSchema = z.object({
  category: z.string().describe("Short category label, e.g. 'Hunting · Fishing · Rewards'"),
  oneLiner: z.string(),
  description: z.string().describe("2-4 sentences about what the brand offers and why people follow it"),
  products: z.array(z.string()).describe("Products, programs or offers, one per entry"),
  campaigns: z.array(z.object({ name: z.string(), description: z.string(), season: z.string().describe("When it runs, e.g. 'Sept-Jan (deer season)'"), cta: z.string() })),
  audience: z.string(),
  voice: z.string().describe("Tone of voice in one or two sentences, with 3 adjectives"),
  pillars: z.array(z.string()).min(3).max(7).describe("Repeatable content pillars"),
  doNots: z.array(z.string()).min(2),
  ctas: z.array(z.string()).max(6),
  hashtagSets: z.object({ core: z.array(z.string()).max(10), seasonal: z.array(z.string()).max(10) }),
});

export const PostAnalysisSchema = z.object({
  format: z.string().describe("Short format label: 'winner announcement', 'trophy photo', 'product feature', 'how-to', 'meme', 'countdown', 'UGC repost', 'graphic with text', 'reel', 'carousel'…"),
  subject: z.string().describe("What is literally shown, one sentence"),
  activity: z.string().describe("Niche activity: whitetail | turkey | bass | waterfowl | elk | ice fishing | gear | giveaway | community | other"),
  hook: z.string().describe("The first line or visual element that grabs attention"),
  captionStyle: z.string().describe("Length, structure, tone, emoji usage of the caption"),
  ctaType: z.string().describe("none | enter | shop | comment | share | tag | link | follow"),
  hasTextOverlay: z.boolean(),
  overlayText: z.string(),
  palette: z.array(z.string()).max(5).describe("Dominant colors as hex codes"),
  composition: z.string().describe("Framing, orientation, subject placement, logo placement"),
  imageryType: z.string().describe("photo | graphic | screenshot | ugc | video | mixed"),
  tone: z.string(),
  whyItWorks: z.string().describe("Why this post likely performed the way it did, concrete"),
  improvements: z.array(z.string()).max(3).describe("Concrete ways a similar post could do better"),
  topics: z.array(z.string()).max(5).describe("Short topic tags"),
});

export const DesignSystemSchema = z.object({
  palette: z.array(z.object({ hex: z.string(), role: z.string().describe("primary | secondary | accent | background | text") })).max(8),
  typography: z.object({ overlayStyle: z.string().describe("How on-image text looks: weight, case, placement, stroke/shadow"), caseStyle: z.string() }),
  logoPlacement: z.string(),
  imagery: z.object({ subjects: z.array(z.string()), styles: z.array(z.string()), framing: z.array(z.string()) }),
  layoutPatterns: z.array(z.string()).describe("Recurring layouts, e.g. 'full-bleed photo + bottom banner'"),
  overlayRules: z.string().describe("When and how text overlays are used"),
  captionStyle: z.object({
    length: z.string(),
    openers: z.array(z.string()).max(6),
    structure: z.string(),
    emoji: z.string(),
    hashtagSets: z.object({ core: z.array(z.string()).max(10), seasonal: z.array(z.string()).max(10) }),
    ctaPatterns: z.array(z.string()).max(6),
  }),
  postingRhythm: z.string().describe("Observed cadence and best days/times"),
  doNots: z.array(z.string()).max(8),
  examples: z.array(z.object({ channelPostId: z.string(), why: z.string() })).max(6),
  summary: z.string().describe("One paragraph describing the visual + verbal identity"),
});

export const InsightsSummarySchema = z.object({
  headline: z.string().describe("One sentence on the account's current performance"),
  working: z.array(z.string()).min(2).max(6).describe("What is working, each grounded in the numbers"),
  notWorking: z.array(z.string()).max(5),
  actions: z.array(z.object({ action: z.string(), why: z.string(), expectedImpact: z.string() })).min(3).max(6),
  audienceNotes: z.string(),
  bestTimes: z.string().describe("Best days/times to post according to the data"),
});

export const RecommendationsSchema = z.object({
  recommendations: z.array(
    z.object({
      title: z.string(),
      concept: z.string().describe("2-3 sentence concept"),
      hook: z.string(),
      format: z.string().describe("image | carousel | reel | video | graphic"),
      platforms: z.array(z.enum(["instagram", "facebook"])).min(1),
      caption: z.string().describe("Ready-to-post caption in the brand voice"),
      hashtags: z.array(z.string()).max(12),
      visualBrief: z.object({
        subject: z.string(),
        composition: z.string(),
        overlayText: z.string(),
        palette: z.array(z.string()).max(4),
        notes: z.string(),
      }),
      bestTime: z.object({ weekday: z.string(), hourLocal: z.number().int().min(0).max(23) }),
      predictedScore: z.number().int().min(1).max(10),
      predictedReachLow: z.number().int().min(0),
      predictedReachHigh: z.number().int().min(0),
      predictedEngagementRate: z.number().min(0).max(1).describe("Fraction, e.g. 0.034"),
      confidence: z.number().min(0).max(1),
      rationale: z.string().describe("Why this should work, citing our posts and competitor posts by number"),
      basedOnOwnPosts: z.array(z.string()).describe("IDs of our posts this draws on"),
      basedOnBenchmarks: z.array(z.string()).describe("IDs of competitor posts this draws on"),
      seasonalHook: z.string().describe("Seasonal moment it rides, or empty"),
    })
  ),
});

export const GiveawayCheckSchema = z.object({
  isPromotion: z.boolean(),
  issues: z.array(z.string()),
  suggestedFix: z.string(),
});
