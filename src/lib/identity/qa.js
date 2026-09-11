import { generateStructured, usageCents } from "@/lib/content/claude";
import { IdentityQaSchema } from "@/lib/content/schemas";

export const QA_THRESHOLD = 0.75;

/**
 * Ask Claude (vision) whether a candidate image shows the same individual as
 * the actor's reference. Returns { score, pass, issues, usable, cents }.
 */
export async function scoreIdentity({ actor, candidateUrl }) {
  const system = `You are a strict identity QA reviewer for an AI character pipeline. Compare a REFERENCE image of a ${actor.kind === "pet" ? "specific animal" : "specific person"} with a CANDIDATE image and judge whether they are the same individual. Focus on stable features: ${actor.kind === "pet" ? "coat color and pattern, markings, ear shape, eye color, build" : "face shape, eyes, nose, mouth, hair, skin tone, distinguishing marks"}. Ignore pose, outfit, lighting and background.`;
  const user = [
    { type: "text", text: `Canonical description: ${actor.canonicalPrompt || "(none)"}\n\nREFERENCE:` },
    { type: "image", source: { type: "url", url: actor.imageUrl } },
    { type: "text", text: "CANDIDATE:" },
    { type: "image", source: { type: "url", url: candidateUrl } },
    { type: "text", text: "Return sameIdentity (0-1), issues, and usable." },
  ];
  const { data, usage } = await generateStructured({ system, user, schema: IdentityQaSchema, effort: "low", maxTokens: 1500 });
  const score = Number(data.sameIdentity);
  return { score, pass: score >= QA_THRESHOLD && data.usable, issues: data.issues, usable: data.usable, cents: usageCents(usage) };
}
