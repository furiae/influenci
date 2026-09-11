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
