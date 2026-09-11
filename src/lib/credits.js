/**
 * Pure pricing helpers, safe to import from client components.
 * 1 credit = $0.005 (see config.stripe.plans).
 */

/** ~150 words per minute => 2.5 words/second. */
export function estimateSpeechSeconds(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.ceil(words / 2.5));
}

/** Credits a generation will cost with the given settings. */
export function estimateCredits(model, settings = {}, prompt = "") {
  if (!model || model.free) return 0;
  const rate =
    (model.rates && settings.resolution && model.rates[settings.resolution]) ?? model.costPerSecond ?? 0;
  let seconds;
  if (model.kind === "lipsync") {
    seconds = estimateSpeechSeconds(prompt);
  } else {
    const d = settings.duration ?? model.params?.duration?.default ?? 5;
    seconds = typeof d === "number" ? d : parseInt(d, 10) || 5;
  }
  return Math.ceil(rate * seconds);
}

export function creditsToUsd(credits) {
  return (credits * 0.005).toFixed(2);
}
