import { PLATFORM_INFO } from "@/lib/platforms";

function cut(s, max) {
  if (!s) return "";
  const t = String(s).trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > max * 0.6 ? lastSpace : max - 1)}…`;
}

function tags(arr, max) {
  return (Array.isArray(arr) ? arr : [])
    .map((h) => String(h).trim().replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, ""))
    .filter(Boolean)
    .slice(0, max)
    .map((h) => `#${h}`);
}

/** X counts every URL as 23 characters. */
function xLength(text) {
  return text.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
}

/**
 * Turn a raw Claude caption variant into a platform-legal PostTarget shape.
 * Returns { caption, title, hashtags }.
 */
export function enforceLimits(platform, variant, disclosure) {
  const info = PLATFORM_INFO[platform];
  const v = variant || {};
  const disc = disclosure ? ` (${disclosure})` : "";

  switch (platform) {
    case "youtube": {
      const hashtags = tags(v.hashtags, info.hashtagsMax);
      const description = cut(`${v.description || ""}${disc}\n\n${hashtags.join(" ")}`.trim(), info.captionMax);
      return { title: cut(v.title || "", info.titleMax), caption: description, hashtags };
    }
    case "pinterest": {
      const hashtags = tags(v.hashtags, info.hashtagsMax);
      return {
        title: cut(v.title || "", info.titleMax),
        caption: cut(`${v.description || ""}${disc} ${hashtags.join(" ")}`.trim(), info.captionMax),
        hashtags,
      };
    }
    case "x": {
      let text = `${v.text || v.caption || ""}${disc}`.trim();
      while (xLength(text) > info.captionMax) text = cut(text, text.length - 10);
      return { title: null, caption: text, hashtags: [] };
    }
    case "facebook": {
      const hashtags = tags(v.hashtags, info.hashtagsMax);
      return {
        title: cut(v.title || "", 100),
        caption: cut(`${v.caption || ""}${disc}\n\n${hashtags.join(" ")}`.trim(), info.captionMax),
        hashtags,
      };
    }
    default: {
      // instagram, tiktok
      const hashtags = tags(v.hashtags, info.hashtagsMax);
      const body = `${v.caption || ""}${disc}`.trim();
      const room = info.captionMax - hashtags.join(" ").length - 2;
      return { title: null, caption: `${cut(body, Math.max(40, room))}\n\n${hashtags.join(" ")}`.trim(), hashtags };
    }
  }
}
