/** Prompt builders that lock the look into every image and video request. */

export const NEGATIVE_DEFAULTS =
  "blurry, low quality, distorted, deformed, extra limbs, extra fingers, bad hands, bad face, asymmetrical eyes, text, watermark, logo, caption, subtitles, static, frozen";

export const PET_NEGATIVE =
  "blurry, low quality, distorted, deformed, extra legs, human hands, human mouth, cartoon, text, watermark, logo, caption, static";

/**
 * Keyframe prompt: canonical identity first (it is the strongest signal),
 * then the scene the script asks for, then framing rules.
 */
export function buildKeyframePrompt(actor, script = {}) {
  const identity = actor.canonicalPrompt?.trim() || `${actor.name}, ${actor.kind === "pet" ? "a pet" : "a person"}`;
  const trigger = actor.kind === "pet" && actor.loraTriggerWord ? `${actor.loraTriggerWord}, ` : "";
  const scene = script.keyframePrompt?.trim() || script.scene?.trim() || "a candid moment for a vertical social video";
  const wardrobe = script.wardrobe ? ` Wearing ${script.wardrobe}.` : "";
  return `${trigger}${identity}. ${scene}.${wardrobe} Same face, same features and markings as the reference image. Vertical 9:16 composition, subject centered, sharp focus on the face, photorealistic, natural skin/fur texture, no text.`;
}

/** Motion prompt for image-to-video. Keep it about movement and sound, not appearance. */
export function buildMotionPrompt(actor, script = {}) {
  const motion = script.motionPrompt?.trim() || script.action?.trim() || "subtle natural movement, looks at the camera";
  const dialogue = script.dialogue?.trim();
  const sound = script.sound?.trim();
  const parts = [motion];
  if (actor.kind === "pet") {
    parts.push("natural animal behaviour, no human-like mouth movement");
    if (sound) parts.push(`ambient sound: ${sound}`);
  } else {
    if (dialogue) parts.push(`the person says: "${dialogue}"`);
    if (sound) parts.push(`sound: ${sound}`);
  }
  parts.push("steady handheld vertical framing, consistent face and clothing throughout, no text overlays");
  return parts.join(". ") + ".";
}

export function negativeFor(actor) {
  return actor.negativePrompt?.trim() || (actor.kind === "pet" ? PET_NEGATIVE : NEGATIVE_DEFAULTS);
}
