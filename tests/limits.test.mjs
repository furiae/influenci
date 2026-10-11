import { describe, it, expect } from "vitest";
import { enforceLimits } from "../src/lib/content/limits.js";

describe("enforceLimits for brand posts (no disclosure)", () => {
  it("keeps instagram captions under the limit and appends hashtags", () => {
    const r = enforceLimits("instagram", { caption: "Big buck down. ".repeat(200), hashtags: ["#whitetail", "deer season", "apex!"] }, null);
    expect(r.caption.length).toBeLessThanOrEqual(2200);
    expect(r.hashtags).toEqual(["#whitetail", "#deerseason", "#apex"]);
    expect(r.caption).not.toMatch(/\(AI/);
  });
  it("facebook keeps a title and the caption text", () => {
    const r = enforceLimits("facebook", { caption: "No purchase necessary.", hashtags: ["fishing"], title: "Spring rewards" }, null);
    expect(r.title).toBe("Spring rewards");
    expect(r.caption).toMatch(/No purchase necessary/);
    expect(r.caption).toMatch(/#fishing/);
  });
});
