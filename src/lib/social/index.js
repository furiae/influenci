import youtube from "./youtube";
import x from "./x";

/** Platform connectors that are implemented. Others show "coming soon" in the UI. */
export const CONNECTORS = { youtube, x };

export function getConnector(platform) {
  return CONNECTORS[platform] || null;
}

export function implementedPlatforms() {
  return Object.keys(CONNECTORS);
}
