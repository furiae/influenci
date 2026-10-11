import { prisma } from "@/lib/prisma";
import { generateStructured, usageCents } from "@/lib/content/claude";
import { DesignSystemSchema } from "@/lib/content/schemas";
import { logEvent } from "@/lib/scheduler/status";

const SYSTEM = `You are a brand designer and copy chief reverse-engineering a social media account's design system and voice from its best-performing posts. Describe what you actually see and read, as rules a designer and a copywriter could follow to make new posts indistinguishable from the account's best work. Prefer concrete values (hex colours, placements, word counts) over adjectives. Output only the requested JSON.`;

function img(url) {
  return url && /^https?:\/\//.test(url) ? [{ type: "image", source: { type: "url", url } }] : [];
}

async function samplePosts(actorId, { limit = 20 } = {}) {
  const top = await prisma.channelPost.findMany({ where: { actorId, score: { not: null }, thumbnailUrl: { not: null } }, orderBy: [{ score: "desc" }, { postedAt: "desc" }], take: limit, select: { id: true, platform: true, mediaType: true, score: true, caption: true, thumbnailUrl: true, engagementRate: true, analysis: true, postedAt: true } });
  return top;
}

function postBlocks(posts, { withImages = 12 } = {}) {
  const blocks = [];
  posts.forEach((p, i) => {
    blocks.push({ type: "text", text: `POST ${i + 1} [${p.id}] ${p.platform} ${p.mediaType} score ${p.score}/10 ER ${p.engagementRate != null ? (p.engagementRate * 100).toFixed(2) + "%" : "n/a"}\nCaption: ${(p.caption || "(none)").slice(0, 600)}${p.analysis ? `\nAnalysis: ${p.analysis.composition}; overlay: ${p.analysis.overlayText || "none"}; palette ${p.analysis.palette?.join(", ")}` : ""}` });
    if (i < withImages) blocks.push(...img(p.thumbnailUrl));
  });
  return blocks;
}

/** Extract a fresh design system from the top posts (overwrites, bumps version). */
export async function extractDesignSystem(actorId) {
  const actor = await prisma.actor.findUnique({ where: { id: actorId } });
  const posts = await samplePosts(actorId);
  if (posts.length < 3) throw new Error("Import at least a few posts with images first");
  const user = [
    { type: "text", text: `Brand: ${actor.name}. ${actor.brandProfile?.oneLiner || ""}\nBelow are the account's best posts (highest 1-10 success score first). Derive the design system and caption style.` },
    ...postBlocks(posts),
    { type: "text", text: "Return the design system. In `examples`, cite up to 6 post ids that best embody it." },
  ];
  const { data, usage } = await generateStructured({ system: SYSTEM, user, schema: DesignSystemSchema, effort: "medium", maxTokens: 6000 });
  const version = (actor.designSystemVersion || 0) + 1;
  const designSystem = { ...data, version, extractedAt: new Date().toISOString(), source: "extracted", pendingSuggestions: [] };
  await prisma.actor.update({ where: { id: actorId }, data: { designSystem, designSystemVersion: version } });
  await logEvent({ actorId, kind: "insights", step: "design_system", costCents: usageCents(usage), message: `v${version} extracted`, data: { previous: actor.designSystem || null } });
  return designSystem;
}

/** Save user edits as a new version (keeps history in PipelineEvent). */
export async function saveDesignSystem(actorId, patch) {
  const actor = await prisma.actor.findUnique({ where: { id: actorId } });
  const version = (actor.designSystemVersion || 0) + 1;
  const designSystem = { ...(actor.designSystem || {}), ...patch, version, editedAt: new Date().toISOString(), source: "edited" };
  await prisma.actor.update({ where: { id: actorId }, data: { designSystem, designSystemVersion: version } });
  await logEvent({ actorId, kind: "insights", step: "design_system", message: `v${version} edited`, data: { previous: actor.designSystem || null } });
  return designSystem;
}

/**
 * Learning loop: compare the newest high scorers with the current system and
 * propose patches (never overwrite the user's edits). Suggestions land in
 * designSystem.pendingSuggestions for the Design tab to accept or reject.
 */
export async function learnDesignSystem(actorId) {
  const actor = await prisma.actor.findUnique({ where: { id: actorId } });
  if (!actor?.designSystem) return { skipped: "no design system" };
  const since = new Date(actor.designSystem.extractedAt || actor.designSystem.editedAt || 0);
  const fresh = await prisma.channelPost.findMany({ where: { actorId, postedAt: { gt: since }, score: { gte: 7 }, thumbnailUrl: { not: null } }, orderBy: { score: "desc" }, take: 8, select: { id: true, platform: true, mediaType: true, score: true, caption: true, thumbnailUrl: true, engagementRate: true, analysis: true, postedAt: true } });
  if (fresh.length < 2) return { skipped: "not enough new high-scoring posts" };
  const { pendingSuggestions, ...current } = actor.designSystem;
  const user = [
    { type: "text", text: `CURRENT DESIGN SYSTEM (v${actor.designSystemVersion}):\n${JSON.stringify(current, null, 1).slice(0, 6000)}\n\nNEW HIGH-SCORING POSTS since it was written:` },
    ...postBlocks(fresh, { withImages: 8 }),
    { type: "text", text: "Return an UPDATED design system that keeps everything still valid and changes only what the new posts justify. Mention in `summary` what changed and why." },
  ];
  const { data, usage } = await generateStructured({ system: SYSTEM, user, schema: DesignSystemSchema, effort: "low", maxTokens: 6000 });
  const diffs = [];
  for (const key of ["palette", "typography", "logoPlacement", "imagery", "layoutPatterns", "overlayRules", "captionStyle", "postingRhythm", "doNots"]) {
    if (JSON.stringify(data[key]) !== JSON.stringify(current[key])) diffs.push({ key, proposed: data[key], current: current[key] ?? null });
  }
  if (!diffs.length) return { suggestions: 0 };
  const suggestion = { id: `s_${Date.now()}`, createdAt: new Date().toISOString(), basedOn: fresh.map((p) => p.id), summary: data.summary, diffs };
  const next = { ...actor.designSystem, pendingSuggestions: [...(pendingSuggestions || []).slice(-4), suggestion] };
  await prisma.actor.update({ where: { id: actorId }, data: { designSystem: next } });
  await logEvent({ actorId, kind: "insights", step: "design_learn", costCents: usageCents(usage), message: `${diffs.length} suggested change(s)` });
  return { suggestions: diffs.length };
}

/** Apply or drop a pending suggestion. */
export async function resolveSuggestion(actorId, suggestionId, { accept, keys } = {}) {
  const actor = await prisma.actor.findUnique({ where: { id: actorId } });
  const ds = actor?.designSystem;
  const s = ds?.pendingSuggestions?.find((x) => x.id === suggestionId);
  if (!s) throw new Error("Suggestion not found");
  const remaining = ds.pendingSuggestions.filter((x) => x.id !== suggestionId);
  if (!accept) {
    await prisma.actor.update({ where: { id: actorId }, data: { designSystem: { ...ds, pendingSuggestions: remaining } } });
    return ds;
  }
  const patch = {};
  for (const d of s.diffs) if (!keys || keys.includes(d.key)) patch[d.key] = d.proposed;
  const saved = await saveDesignSystem(actorId, { ...patch, pendingSuggestions: remaining, source: "learned" });
  return saved;
}

/** Visual-brief prompt block for image generation. */
export function designSystemToImagePrompt(ds, brief = {}) {
  if (!ds) return brief.notes || "";
  const palette = (ds.palette || []).map((p) => `${p.hex} (${p.role})`).join(", ");
  return [
    brief.subject ? `Subject: ${brief.subject}.` : "",
    brief.composition ? `Composition: ${brief.composition}.` : `Composition: ${(ds.layoutPatterns || []).slice(0, 2).join("; ")}.`,
    `Imagery style: ${(ds.imagery?.styles || []).join(", ")}; typical framing ${(ds.imagery?.framing || []).join(", ")}.`,
    palette ? `Brand palette: ${palette}.` : "",
    brief.overlayText ? `Text overlay reads exactly: "${brief.overlayText}". Style: ${ds.typography?.overlayStyle || "bold, high contrast"}.` : "No text overlay.",
    ds.logoPlacement ? `Leave space for the logo at: ${ds.logoPlacement}.` : "",
    brief.notes || "",
    "Photorealistic, natural light, no watermarks, no extra text.",
  ].filter(Boolean).join(" ");
}
