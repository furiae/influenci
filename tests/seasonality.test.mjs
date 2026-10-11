import { describe, it, expect } from "vitest";
import { upcomingSeasons, seasonsToPrompt } from "../src/lib/insights/seasonality.js";

describe("upcomingSeasons", () => {
  it("finds the rut in late October and wraps the year for ice fishing", () => {
    const names = upcomingSeasons({ start: new Date(2026, 9, 20), days: 30 }).map((s) => s.name);
    expect(names).toContain("Whitetail rut");
    expect(names).toContain("Gun season openers");
    const winter = upcomingSeasons({ start: new Date(2026, 11, 28), days: 20 }).map((s) => s.name);
    expect(winter).toContain("Ice fishing");
    expect(winter).toContain("Shed hunting & recap");
  });
  it("merges brand-specific moments and renders a prompt block", () => {
    const list = upcomingSeasons({ start: new Date(2026, 3, 1), days: 10, extra: [{ name: "Turkey Challenge entries open", from: "04-01", to: "04-05" }] });
    expect(list.map((s) => s.name)).toContain("Turkey Challenge entries open");
    expect(seasonsToPrompt(list)).toMatch(/SEASONAL MOMENTS/);
    expect(seasonsToPrompt([])).toBe("");
  });
});
