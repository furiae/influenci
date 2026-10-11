import youtube from "./youtube";
import x from "./x";
import { facebook, instagram } from "./meta";

/** Platform connectors that are implemented. Others show "coming soon" in the UI. */
export const CONNECTORS = { youtube, x, facebook, instagram };

export function getConnector(platform) {
  return CONNECTORS[platform] || null;
}

export function implementedPlatforms() {
  return Object.keys(CONNECTORS);
}

/** Platforms whose connector can read our own post history and metrics. */
export function importablePlatforms() {
  return Object.values(CONNECTORS).filter((c) => typeof c.listPosts === "function").map((c) => c.id);
}
