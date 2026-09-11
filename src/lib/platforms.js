/**
 * Platform catalog shared by the scheduler, connectors and UI.
 * Limits are conservative values from each platform's current docs.
 */
export const PLATFORMS = ["instagram", "facebook", "tiktok", "youtube", "pinterest", "x"];

export const PLATFORM_INFO = {
  instagram: {
    label: "Instagram",
    app: "meta",
    color: "#E1306C",
    captionMax: 2200,
    hashtagsMax: 30,
    video: { maxSec: 90, minSec: 3, maxBytes: 300 * 1024 * 1024, aspect: "9:16" },
    image: true,
    aiFlag: "caption",
  },
  facebook: {
    label: "Facebook",
    app: "meta",
    color: "#1877F2",
    captionMax: 63206,
    hashtagsMax: 10,
    video: { maxSec: 90, minSec: 3, maxBytes: 1024 * 1024 * 1024, aspect: "9:16" },
    image: true,
    aiFlag: "caption",
  },
  tiktok: {
    label: "TikTok",
    app: "tiktok",
    color: "#010101",
    captionMax: 2200,
    hashtagsMax: 10,
    video: { maxSec: 600, minSec: 3, maxBytes: 4 * 1024 * 1024 * 1024, aspect: "9:16" },
    image: true,
    aiFlag: "is_aigc",
  },
  youtube: {
    label: "YouTube",
    app: "youtube",
    color: "#FF0000",
    titleMax: 100,
    captionMax: 5000,
    hashtagsMax: 15,
    video: { maxSec: 180, minSec: 1, maxBytes: 2 * 1024 * 1024 * 1024, aspect: "9:16" },
    image: false,
    aiFlag: "containsSyntheticMedia",
  },
  pinterest: {
    label: "Pinterest",
    app: "pinterest",
    color: "#E60023",
    titleMax: 100,
    captionMax: 500,
    hashtagsMax: 5,
    video: { maxSec: 900, minSec: 4, maxBytes: 2 * 1024 * 1024 * 1024, aspect: "9:16" },
    image: true,
    aiFlag: "caption",
  },
  x: {
    label: "X",
    app: "x",
    color: "#000000",
    captionMax: 280,
    hashtagsMax: 3,
    video: { maxSec: 140, minSec: 1, maxBytes: 512 * 1024 * 1024, aspect: "9:16" },
    image: true,
    aiFlag: "caption",
  },
};

/** Developer apps: one per platform family. */
export const PLATFORM_APPS = {
  meta: { label: "Meta (Instagram + Facebook)", platforms: ["instagram", "facebook"], portal: "https://developers.facebook.com/apps/" },
  tiktok: { label: "TikTok", platforms: ["tiktok"], portal: "https://developers.tiktok.com/" },
  youtube: { label: "Google (YouTube)", platforms: ["youtube"], portal: "https://console.cloud.google.com/apis/credentials" },
  pinterest: { label: "Pinterest", platforms: ["pinterest"], portal: "https://developers.pinterest.com/apps/" },
  x: { label: "X", platforms: ["x"], portal: "https://developer.x.com/en/portal/dashboard" },
};

export function platformLabel(p) {
  return PLATFORM_INFO[p]?.label || p;
}

export function isPlatform(p) {
  return PLATFORMS.includes(p);
}
