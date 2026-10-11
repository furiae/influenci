import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { renderCard, renderCardSvg, renderSvgPng, normalizeCard, TEMPLATES } from "../src/lib/render/templates/apex-card.js";

const photo = `data:image/png;base64,${fs.readFileSync("public/seed/apex/21.png").toString("base64")}`;
const actor = { name: "Apex Outdoor Rewards", designSystem: { palette: [{ hex: "#C8102E", role: "primary" }] }, brandProfile: {} };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("card compositor", () => {
  it("validates fields and photo requirements", () => {
    expect(() => normalizeCard({ template: "winner", fields: { state: "AL" }, photoUrl: "x" })).toThrow(/Hunter name/);
    expect(() => normalizeCard({ template: "winner", fields: { name: "A B", state: "AL" } })).toThrow(/photo/);
    expect(() => normalizeCard({ template: "nope", fields: {} })).toThrow(/Unknown template/);
    expect(normalizeCard({ template: "question", fields: { question: "Shoot or pass?", extra: "ignored" } })).toEqual({ template: "question", fields: { question: "Shoot or pass?" }, photoUrl: null });
  });

  it("renders every template to a 1080x1350 PNG", async () => {
    const cases = {
      winner: { name: "Jon Austin Motes", place: "1", state: "Alabama", prize: "$800", season: "Whitetail 2026", headline: "Celebrating Our Winners!" },
      contender: { name: "William Strong", state: "Michigan", year: "2026" },
      throwback: { name: "Brandon Roberts", state: "West Virginia", year: "2023" },
      question: { question: "What is 1 tip you would give a new deer hunter?" },
      photo: { headline: "Share If You're Ready For Cool, Crisp Mornings In The Tree Stand", subhead: "What's the one tradition your camp never skips?", kicker: "One week to gun season" },
    };
    for (const template of Object.keys(TEMPLATES)) {
      const { png, width, height } = await renderCard({ template, fields: cases[template], photoUrl: TEMPLATES[template].photo ? photo : null, actor });
      expect(png.subarray(0, 4).equals(PNG)).toBe(true);
      expect([width, height]).toEqual([1080, 1350]);
      expect(png.length).toBeGreaterThan(20000);
    }
  }, 60000);

  it("desaturates the throwback photo and rejects WebP", async () => {
    const svg = await renderCardSvg({ template: "throwback", fields: { name: "A B", state: "WV" }, photoUrl: photo, actor });
    expect(svg).toContain('filter="url(#bw)"');
    const webp = `data:image/webp;base64,${fs.readFileSync("public/seed/apex/1.webp").toString("base64")}`;
    await expect(renderCard({ template: "winner", fields: { name: "A B", state: "WV" }, photoUrl: webp, actor })).rejects.toThrow(/JPEG or PNG/);
  }, 30000);
});

describe("designed SVG rasterizer", () => {
  it("renders an SVG with the brand fonts to a PNG and rejects scripts", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#C8102E"/><text x="540" y="700" font-family="Oswald" font-weight="700" font-size="120" fill="#fff" text-anchor="middle">SHOOT OR PASS?</text></svg>`;
    const { png, width, height } = await renderSvgPng(svg);
    expect(png.subarray(0, 4).equals(PNG)).toBe(true);
    expect([width, height]).toEqual([1080, 1350]);
    await expect(renderSvgPng(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)).rejects.toThrow(/scripts/);
  }, 30000);
});
