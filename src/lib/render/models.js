/**
 * Which Wavespeed models the operations pipeline uses, per actor kind.
 * Confirmed against wavespeed.ai model pages on 2026-09-11.
 */
export const RENDER = {
  human: {
    keyframe: { slug: "google/nano-banana-pro/edit-multi", cents: 7 },
    video: { slug: "kwaivgi/kling-v2.6-pro/image-to-video", centsPer5s: 35, soundMultiplier: 2, durations: [5, 10] },
  },
  pet: {
    keyframeLora: { slug: "wavespeed-ai/flux-2-dev/edit-lora", cents: 3 },
    keyframe: { slug: "google/nano-banana-pro/edit-multi", cents: 7 },
    video: { slug: "alibaba/wan-2.6/image-to-video-flash", centsPer5s: 12.5, soundMultiplier: 2, durations: [5, 10] },
  },
  references: { slug: "google/nano-banana-pro/edit-multi", cents: 7 },
  element: { slug: "kwaivgi/kling-elements-advanced", cents: 1 },
  lora: { slug: "wavespeed-ai/flux-dev-lora-trainer", cents: 100 },
};

export function renderConfig(actor) {
  return actor.kind === "pet" ? RENDER.pet : RENDER.human;
}

export function videoCents(actor, { lengthSec = 5, audio = true } = {}) {
  const v = renderConfig(actor).video;
  return Math.round(v.centsPer5s * (lengthSec / 5) * (audio ? v.soundMultiplier : 1));
}

export function keyframeCents(actor) {
  const c = renderConfig(actor);
  return actor.kind === "pet" && actor.loraUrl ? c.keyframeLora.cents : c.keyframe.cents;
}

/** Full estimate for one post before rendering. */
export function estimatePostCents(actor, { mediaType = "video", lengthSec = 5, audio = true } = {}) {
  const kf = Math.round(keyframeCents(actor) * 1.3); // QA retries
  const qa = 2;
  const text = 16;
  return kf + qa + text + (mediaType === "video" ? videoCents(actor, { lengthSec, audio }) : 0);
}
