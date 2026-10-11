import { describe, it, expect } from "vitest";
import { nextSlot } from "../src/lib/insights/post-from-rec.js";

describe("nextSlot", () => {
  it("picks the next matching weekday/hour at least two hours out", () => {
    const now = new Date(Date.UTC(2026, 9, 11, 12)); // Sunday 08:00 New York (EDT)
    const at = nextSlot({ weekday: "Tuesday", hourLocal: 18 }, "America/New_York", now);
    expect(at.getTime()).toBeGreaterThan(now.getTime() + 2 * 3600 * 1000);
    expect(at.toISOString()).toBe("2026-10-13T22:00:00.000Z");
  });
  it("falls back to tomorrow when the weekday is unknown", () => {
    const now = new Date(Date.UTC(2026, 9, 11, 12));
    const at = nextSlot({}, "America/New_York", now);
    expect(at.getTime()).toBeGreaterThan(now.getTime());
  });
});
