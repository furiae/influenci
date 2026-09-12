import { PLATFORM_INFO } from "@/lib/platforms";

/** Returns a list of human-readable problems; empty means publishable. */
export function validateForPlatform(platform, { mediaType = "video", videoMeta = {} } = {}) {
  const info = PLATFORM_INFO[platform];
  const problems = [];
  if (!info) return ["unknown platform"];
  if (mediaType === "image") {
    if (!info.image) problems.push(`${info.label} does not accept still-image posts`);
    return problems;
  }
  const d = Number(videoMeta.durationSec || 0);
  const bytes = Number(videoMeta.bytes || 0);
  if (d && d > info.video.maxSec) problems.push(`video is ${d}s; ${info.label} allows up to ${info.video.maxSec}s`);
  if (d && d < info.video.minSec) problems.push(`video is ${d}s; ${info.label} needs at least ${info.video.minSec}s`);
  if (bytes && bytes > info.video.maxBytes) problems.push(`file is ${(bytes / 1048576).toFixed(0)} MB; over ${info.label}'s limit`);
  return problems;
}
