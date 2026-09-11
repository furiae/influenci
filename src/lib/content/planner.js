import { generateStructured, usageCents } from "./claude";
import { IdeasSchema, ScriptSchema, CaptionsSchema, BibleSchema } from "./schemas";
import { bibleToSystemPrompt, mergeBible } from "@/lib/personas/bible";
import { enforceLimits } from "./limits";
import { PLATFORMS } from "@/lib/platforms";

/** Daily ideas. `recent` = recent post ideas to avoid repeating. */
export async function planIdeas({ actor, date, count = 1, recent = [] }) {
  const system = bibleToSystemPrompt(actor);
  const user = `Today is ${date}. Propose ${count} distinct video idea(s) for ${actor.name}.
Rotate content pillars. Avoid anything close to these recent ideas:
${recent.length ? recent.map((r) => `- ${r}`).join("\n") : "- (none yet)"}
Each idea must work as a ${actor.kind === "pet" ? "silent-or-ambient pet clip" : "5-10 second talking or action clip"} shot vertically.`;
  const { data, usage } = await generateStructured({ system, user, schema: IdeasSchema, effort: "low" });
  return { ideas: data.ideas.slice(0, count), costCents: usageCents(usage) };
}

/** Turn an idea into a shot list. */
export async function writeScript({ actor, idea, mediaType = "video", clipLengthSec = 5 }) {
  const system = bibleToSystemPrompt(actor);
  const petRules = actor.kind === "pet"
    ? "This is a pet: dialogue must be an empty string; describe natural animal behaviour and ambient sound. The narrator voice, if any, lives in the caption, not the video."
    : "The character may speak one or two short lines on camera; keep dialogue natural and under 25 words for 5 s or 45 words for 10 s.";
  const user = `Write the script for this ${mediaType === "image" ? "still image post" : `${clipLengthSec}-second vertical video`}.
Idea: ${idea.idea}
Pillar: ${idea.pillar}
Hook: ${idea.hook}
${petRules}
keyframePrompt describes setting, wardrobe, pose and expression only; identity is added by the system.
motionPrompt describes movement and camera only. durationSec must be ${clipLengthSec}.`;
  const { data, usage } = await generateStructured({ system, user, schema: ScriptSchema, effort: "medium" });
  return { script: { ...data, durationSec: clipLengthSec }, costCents: usageCents(usage) };
}

/** Per-platform captions for a finished script. */
export async function writeVariants({ actor, script, idea, platforms = PLATFORMS }) {
  const system = bibleToSystemPrompt(actor);
  const bible = mergeBible(actor.bible, {});
  const user = `Write the captions for this post on every platform.
Idea: ${idea?.idea || ""}
Hook: ${script.hook}
What happens: ${script.scene} ${script.action} ${script.dialogue ? `Dialogue: "${script.dialogue}"` : ""}
On-screen text: ${script.onScreenText || "(none)"}

Rules per platform:
- instagram: conversational caption 1-3 short paragraphs, 5-8 hashtags.
- facebook: same energy, slightly longer, a short title, 3-5 hashtags.
- tiktok: one or two punchy lines, 4-6 hashtags.
- youtube: title under 60 characters with curiosity, description 2-4 lines with the hook first, 5-8 hashtags.
- pinterest: keyword-rich searchable title under 90 characters and a 1-3 sentence description, 3-5 hashtags.
- x: under 240 characters, no hashtags needed, no links.
Do not include the AI disclosure yourself; the system appends "(${bible.aiDisclosure})".`;
  const { data, usage } = await generateStructured({ system, user, schema: CaptionsSchema, effort: "medium" });
  const variants = {};
  for (const p of platforms) variants[p] = enforceLimits(p, data[p], bible.aiDisclosure);
  return { variants, raw: data, costCents: usageCents(usage) };
}

/** Draft a bible from a few words. */
export async function generateBible({ name, kind, notes }) {
  const system = "You design believable, brand-safe AI influencer personas for short-form video. Output only the requested JSON.";
  const user = `Create a persona bible for "${name}", ${kind === "pet" ? "a pet character (animal)" : "a human-looking character"}.
Notes from the owner: ${notes || "(none)"}
Be specific and consistent; the canonicalPrompt must describe a unique, recognisable look (hair/coat, eyes, distinguishing marks, build, default outfit) in one sentence.
Include a truthful AI disclosure line. Content pillars should be repeatable daily formats.`;
  const { data, usage } = await generateStructured({ system, user, schema: BibleSchema, effort: "medium" });
  const { canonicalPrompt, ...bible } = data;
  return { bible, canonicalPrompt, costCents: usageCents(usage) };
}
