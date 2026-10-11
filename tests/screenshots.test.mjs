import { describe, it, expect } from "vitest";
import { screenshotExternalId } from "../src/lib/insights/screenshots.js";
import { APEX_POSTS } from "../src/lib/seed/apex.js";

describe("screenshotExternalId", () => {
  it("is stable for the same post and differs across posts", () => {
    const a = screenshotExternalId("facebook", "2026-09-27T14:00:00Z", "Every Harvest Represents Dedication");
    const b = screenshotExternalId("facebook", "2026-09-27T14:00:00Z", "Every   Harvest represents dedication");
    const c = screenshotExternalId("facebook", "2026-09-27T14:01:00Z", "Every Harvest Represents Dedication");
    expect(a).toMatch(/^ss_[0-9a-f]{20}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it("gives every seeded Apex post a unique id", () => {
    const ids = new Set(APEX_POSTS.map((p) => screenshotExternalId("facebook", `${p.postedAt}:00-05:00`, p.caption)));
    expect(ids.size).toBe(APEX_POSTS.length);
  });
});
