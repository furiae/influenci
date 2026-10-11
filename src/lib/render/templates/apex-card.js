import fs from "node:fs";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

/**
 * Zero-AI brand card compositor. Reproduces the card formats the brand already
 * posts (winner, contender, throwback, question) from a photo + a few fields,
 * so these posts cost nothing to render. Output is a 1080×1350 PNG.
 *
 * Palette and brand name come from the actor's design system / profile; the
 * defaults are the Apex Outdoor Rewards look (red on near-black, hazard
 * stripes, block caps).
 */

export const W = 1080;
export const H = 1350;

export const TEMPLATES = {
  winner: {
    label: "Winner card",
    description: "Red hazard WINNER banner, hunter name, place + state, prize, season badge. Needs the hunter's photo.",
    fields: [
      { key: "name", label: "Hunter name", required: true, example: "Jon Austin Motes" },
      { key: "place", label: "Place", example: "1st", hint: "1st, 2nd, 3rd" },
      { key: "state", label: "State", required: true, example: "Alabama" },
      { key: "prize", label: "Prize", example: "$800" },
      { key: "season", label: "Season badge", example: "Whitetail 2026" },
      { key: "headline", label: "Headline", example: "Celebrating Our Winners!" },
    ],
    photo: true,
  },
  contender: {
    label: "Contender card",
    description: "Vertical state + year block letters, CONTENDER headline, hunter name. Needs the hunter's photo.",
    fields: [
      { key: "name", label: "Hunter name", required: true, example: "William Strong" },
      { key: "state", label: "State", required: true, example: "Michigan" },
      { key: "year", label: "Year", example: "2026" },
      { key: "headline", label: "Headline", example: "Every Successful Harvest Deserves Recognition" },
    ],
    photo: true,
  },
  throwback: {
    label: "Throwback card",
    description: "Black-and-white treatment, THROWBACK label, hunter name, state + year. Needs the hunter's photo.",
    fields: [
      { key: "name", label: "Hunter name", required: true, example: "Brandon Roberts" },
      { key: "state", label: "State", required: true, example: "West Virginia" },
      { key: "year", label: "Year", example: "2023" },
      { key: "headline", label: "Headline", example: "The Next Winning Harvest Could Have YOUR Name On It" },
    ],
    photo: true,
  },
  photo: {
    label: "Photo + headline",
    description: "Your own photo (hunter, camp, trail cam) with a brand headline over a dark gradient. The format behind the brand's share graphics and most reels. Free.",
    fields: [
      { key: "headline", label: "Headline", required: true, example: "Share If You're Ready For Cool, Crisp Mornings In The Tree Stand" },
      { key: "subhead", label: "Subhead", example: "What's the one tradition your camp never skips?" },
      { key: "kicker", label: "Kicker (top)", example: "One week to gun season" },
    ],
    photo: true,
  },
  question: {
    label: "Question card",
    description: "Solid brand-red card with a big centred question. No photo needed. Questions pull 5–10× the comments of announcements.",
    fields: [
      { key: "question", label: "Question", required: true, example: "What is 1 tip you would give a new deer hunter?" },
      { key: "kicker", label: "Kicker", example: "Tell us in the comments" },
    ],
    photo: false,
  },
};

const FONT_DIR = path.join(process.cwd(), "src/lib/render/templates/fonts");
let fontCache = null;
function fonts() {
  if (fontCache) return fontCache;
  const read = (f) => fs.readFileSync(path.join(FONT_DIR, f));
  fontCache = [
    { name: "Oswald", data: read("oswald-latin-700-normal.woff"), weight: 700, style: "normal" },
    { name: "Oswald", data: read("oswald-latin-500-normal.woff"), weight: 500, style: "normal" },
    { name: "Inter", data: read("inter-latin-800-normal.woff"), weight: 800, style: "normal" },
    { name: "Inter", data: read("inter-latin-500-normal.woff"), weight: 500, style: "normal" },
  ];
  return fontCache;
}

const h = (type, style, children, extra = {}) => ({ type, props: { style, ...extra, children } });

export function brandTheme(actor) {
  const ds = actor?.designSystem || {};
  const pal = Array.isArray(ds.palette) ? ds.palette : [];
  const pick = (roles, fallback) => pal.find((p) => roles.some((r) => String(p.role || "").toLowerCase().includes(r)))?.hex || fallback;
  const profile = actor?.brandProfile || {};
  return {
    red: pick(["primary", "accent", "brand"], "#C8102E"),
    black: pick(["background", "dark"], "#0B0B0B"),
    grey: "#9A9A9A",
    white: "#FFFFFF",
    yellow: "#F2C230",
    brand: String(profile.shortName || actor?.name || "APEX OUTDOOR REWARDS").toUpperCase(),
    program: String(profile.programName || "CHALLENGE").toUpperCase(),
    logoUrl: profile.assets?.logoUrl || null,
  };
}

async function toDataUri(url) {
  if (!url) return null;
  if (url.startsWith("data:")) {
    if (!/^data:image\/(jpeg|png|gif);base64,/.test(url)) throw new Error("Photo must be a JPEG or PNG data URI; WebP cannot be composited");
    return url;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load photo (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const type = sniffImageType(buf) || (res.headers.get("content-type") || "image/jpeg").split(";")[0];
  if (!["image/jpeg", "image/png", "image/gif"].includes(type)) throw new Error(`Photo must be a JPEG or PNG (got ${type}); WebP/HEIC cannot be composited`);
  return `data:${type};base64,${buf.toString("base64")}`;
}

function sniffImageType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

const splitName = (name) => {
  const parts = String(name || "").trim().split(/\s+/);
  if (parts.length < 2) return { first: "", last: parts[0] || "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
};
const ordinal = (p) => {
  const s = String(p || "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) { const n = Number(s); return `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`; }
  return s;
};

function photoLayer(photo, t, { dim = 0.35 } = {}) {
  return [
    photo
      ? h("img", { position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }, undefined, { src: photo, width: W, height: H })
      : h("div", { position: "absolute", top: 0, left: 0, width: W, height: H, backgroundImage: `linear-gradient(160deg, #2a2a2a 0%, ${t.black} 70%)` }),
    h("div", { position: "absolute", top: 0, left: 0, width: W, height: H, backgroundImage: `linear-gradient(180deg, rgba(0,0,0,${dim}) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0.1) 48%, rgba(0,0,0,0.82) 68%, rgba(0,0,0,0.96) 100%)` }),
  ];
}

const stripes = (t, height = 18) => h("div", { width: "100%", height, backgroundImage: `linear-gradient(135deg, ${t.black} 25%, ${t.yellow} 25%, ${t.yellow} 50%, ${t.black} 50%, ${t.black} 75%, ${t.yellow} 75%)`, backgroundSize: "36px 36px" });

function footer(t) {
  return h("div", { position: "absolute", left: 56, right: 56, bottom: 48, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }, [
    h("div", { display: "flex", flexDirection: "column" }, [
      h("div", { fontFamily: "Oswald", fontWeight: 700, fontSize: 40, color: t.red, letterSpacing: 2, transform: "skewX(-8deg)" }, t.brand),
      h("div", { fontFamily: "Inter", fontWeight: 800, fontSize: 20, color: t.grey, letterSpacing: 6 }, t.program),
    ]),
    t.logoUrl ? h("img", { width: 120, height: 120, objectFit: "contain" }, undefined, { src: t.logoUrl, width: 120, height: 120 }) : h("div", { width: 0, height: 0 }),
  ]);
}

function nameBlock(name, t, { size = 1 } = {}) {
  const { first, last } = splitName(name);
  return h("div", { display: "flex", flexDirection: "column", color: t.white }, [
    first ? h("div", { fontFamily: "Oswald", fontWeight: 500, fontSize: 54 * size, letterSpacing: 4, textTransform: "uppercase" }, first) : h("div", {}),
    h("div", { fontFamily: "Oswald", fontWeight: 700, fontSize: 112 * size, lineHeight: 1, letterSpacing: 2, textTransform: "uppercase" }, last),
  ]);
}

function winner(f, photo, t) {
  const prize = String(f.prize || "").trim();
  const place = ordinal(f.place);
  return h("div", { width: W, height: H, display: "flex", position: "relative", backgroundColor: t.black, fontFamily: "Inter" }, [
    ...photoLayer(photo, t),
    h("div", { position: "absolute", top: 0, left: 0, width: W, display: "flex", flexDirection: "column" }, [
      stripes(t),
      h("div", { width: "100%", backgroundColor: t.red, display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 0" }, h("div", { fontFamily: "Oswald", fontWeight: 700, fontSize: 132, lineHeight: 1, color: t.white, letterSpacing: 18, textTransform: "uppercase", transform: "skewX(-8deg)" }, "WINNER")),
      stripes(t),
    ]),
    f.season ? h("div", { position: "absolute", top: 300, right: 56, border: `4px solid ${t.white}`, padding: "8px 18px", fontFamily: "Oswald", fontWeight: 700, fontSize: 30, color: t.white, letterSpacing: 4, textTransform: "uppercase", backgroundColor: "rgba(0,0,0,0.35)" }, f.season) : h("div", {}),
    h("div", { position: "absolute", left: 56, right: 56, bottom: 190, display: "flex", flexDirection: "column", gap: 8 }, [
      f.headline ? h("div", { fontFamily: "Inter", fontWeight: 800, fontSize: 28, color: t.yellow, letterSpacing: 3, textTransform: "uppercase" }, f.headline) : h("div", {}),
      nameBlock(f.name, t),
      h("div", { display: "flex", alignItems: "center", gap: 18, marginTop: 6 }, [
        place ? h("div", { fontFamily: "Inter", fontWeight: 800, fontSize: 34, color: t.white, letterSpacing: 6, textTransform: "uppercase" }, `${place} PLACE`) : h("div", {}),
        place ? h("div", { width: 10, height: 10, backgroundColor: t.red }) : h("div", {}),
        h("div", { fontFamily: "Inter", fontWeight: 800, fontSize: 34, color: t.grey, letterSpacing: 6, textTransform: "uppercase" }, f.state || ""),
      ]),
      prize ? h("div", { fontFamily: "Oswald", fontWeight: 700, fontSize: 150, lineHeight: 1, color: t.red, letterSpacing: 2, marginTop: 4 }, prize) : h("div", {}),
    ]),
    footer(t),
  ]);
}

function contender(f, photo, t) {
  const side = `${String(f.state || "").toUpperCase()}  ${f.year || ""}`.trim();
  return h("div", { width: W, height: H, display: "flex", position: "relative", backgroundColor: t.black }, [
    ...photoLayer(photo, t, { dim: 0.2 }),
    h("div", { position: "absolute", top: 0, left: 0, width: 150, height: H, backgroundColor: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center" },
      h("div", { fontFamily: "Oswald", fontWeight: 700, fontSize: 96, color: t.grey, letterSpacing: 10, whiteSpace: "nowrap", transform: "rotate(-90deg)" }, side)),
    h("div", { position: "absolute", top: 56, left: 190, display: "flex", flexDirection: "column" }, [
      h("div", { fontFamily: "Oswald", fontWeight: 700, fontSize: 96, lineHeight: 1, color: t.red, letterSpacing: 10, textTransform: "uppercase", transform: "skewX(-8deg)" }, "CONTENDER"),
      h("div", { width: 220, height: 10, backgroundColor: t.red, marginTop: 10 }),
    ]),
    h("div", { position: "absolute", left: 190, right: 56, bottom: 190, display: "flex", flexDirection: "column", gap: 10 }, [
      f.headline ? h("div", { fontFamily: "Inter", fontWeight: 800, fontSize: 26, color: t.yellow, letterSpacing: 3, textTransform: "uppercase" }, f.headline) : h("div", {}),
      nameBlock(f.name, t, { size: 0.9 }),
      h("div", { fontFamily: "Inter", fontWeight: 800, fontSize: 30, color: t.grey, letterSpacing: 6, textTransform: "uppercase" }, `${f.state || ""}${f.year ? ` · ${f.year}` : ""}`),
    ]),
    footer(t),
  ]);
}

function throwback(f, photo, t) {
  return h("div", { width: W, height: H, display: "flex", position: "relative", backgroundColor: t.black }, [
    ...photoLayer(photo, t, { dim: 0.45 }),
    h("div", { position: "absolute", top: 64, left: 56, display: "flex", flexDirection: "column" }, [
      h("div", { fontFamily: "Inter", fontWeight: 800, fontSize: 26, color: t.grey, letterSpacing: 8, textTransform: "uppercase" }, "THROWBACK"),
      h("div", { fontFamily: "Oswald", fontWeight: 700, fontSize: 120, lineHeight: 1, color: t.white, letterSpacing: 6, textTransform: "uppercase", transform: "skewX(-8deg)" }, "HUNTER"),
      h("div", { width: 160, height: 10, backgroundColor: t.red, marginTop: 12 }),
    ]),
    h("div", { position: "absolute", left: 56, right: 56, bottom: 190, display: "flex", flexDirection: "column", gap: 10 }, [
      nameBlock(f.name, t, { size: 0.9 }),
      h("div", { fontFamily: "Inter", fontWeight: 800, fontSize: 30, color: t.grey, letterSpacing: 6, textTransform: "uppercase" }, `${f.state || ""}${f.year ? ` · ${f.year}` : ""}`),
      f.headline ? h("div", { fontFamily: "Inter", fontWeight: 800, fontSize: 26, color: t.yellow, letterSpacing: 3, textTransform: "uppercase", marginTop: 6 }, f.headline) : h("div", {}),
    ]),
    footer(t),
  ]);
}

function question(f, _photo, t) {
  const q = String(f.question || "").trim();
  const size = q.length > 90 ? 72 : q.length > 50 ? 88 : 104;
  // No padding on the root: satori lays the root out content-box, so padding would push the bottom off-canvas.
  return h("div", { width: W, height: H, display: "flex", position: "relative", backgroundColor: t.red }, [
    h("div", { position: "absolute", top: 0, left: 0, width: W, display: "flex" }, stripes(t, 14)),
    h("div", { position: "absolute", top: 72, left: 72, width: W - 144, height: H - 144, display: "flex", flexDirection: "column" }, [
      h("div", { fontFamily: "Inter", fontWeight: 800, fontSize: 24, color: "rgba(255,255,255,0.75)", letterSpacing: 8, textTransform: "uppercase", marginTop: 20 }, t.brand),
      h("div", { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" },
        h("div", { fontFamily: "Oswald", fontWeight: 700, fontSize: size, lineHeight: 1.1, color: t.white, textAlign: "center", textTransform: "uppercase", letterSpacing: 2 }, q)),
      h("div", { display: "flex", alignItems: "flex-end", justifyContent: "space-between" }, [
        h("div", { fontFamily: "Inter", fontWeight: 800, fontSize: 30, color: t.white, letterSpacing: 4, textTransform: "uppercase", borderBottom: `6px solid ${t.white}`, paddingBottom: 6 }, f.kicker || "Tell us in the comments"),
        t.logoUrl ? h("img", { width: 110, height: 110, objectFit: "contain" }, undefined, { src: t.logoUrl, width: 110, height: 110 }) : h("div", {}),
      ]),
    ]),
    h("div", { position: "absolute", bottom: 0, left: 0, width: W, display: "flex" }, stripes(t, 14)),
  ]);
}

function photo(f, photoUri, t) {
  const headline = String(f.headline || "").trim();
  const size = headline.length > 110 ? 64 : headline.length > 70 ? 76 : headline.length > 40 ? 92 : 108;
  return h("div", { width: W, height: H, display: "flex", position: "relative", backgroundColor: t.black }, [
    ...photoLayer(photoUri, t, { dim: 0.45 }),
    f.kicker ? h("div", { position: "absolute", top: 56, left: 56, right: 56, display: "flex" }, h("div", { fontFamily: "Inter", fontWeight: 800, fontSize: 28, color: t.white, letterSpacing: 6, textTransform: "uppercase", backgroundColor: t.red, padding: "10px 18px" }, f.kicker)) : h("div", {}),
    h("div", { position: "absolute", left: 56, right: 56, bottom: 190, display: "flex", flexDirection: "column", gap: 14 }, [
      h("div", { fontFamily: "Oswald", fontWeight: 700, fontSize: size, lineHeight: 1.05, color: t.white, textTransform: "uppercase", letterSpacing: 2 }, headline),
      f.subhead ? h("div", { fontFamily: "Inter", fontWeight: 800, fontSize: 30, color: t.yellow, letterSpacing: 2 }, f.subhead) : h("div", {}),
      h("div", { width: 180, height: 10, backgroundColor: t.red }),
    ]),
    footer(t),
  ]);
}

const RENDERERS = { winner, contender, throwback, question, photo };

/** Validate template + fields; returns { template, fields } or throws. */
export function normalizeCard({ template, fields = {}, photoUrl } = {}) {
  const spec = TEMPLATES[template];
  if (!spec) throw new Error(`Unknown template "${template}". Use one of: ${Object.keys(TEMPLATES).join(", ")}`);
  const clean = {};
  for (const f of spec.fields) {
    const v = fields[f.key] != null ? String(fields[f.key]).trim().slice(0, 160) : "";
    if (f.required && !v) throw new Error(`${spec.label}: "${f.label}" is required`);
    if (v) clean[f.key] = v;
  }
  if (spec.photo && !photoUrl) throw new Error(`${spec.label} needs a photo (photoUrl)`);
  return { template, fields: clean, photoUrl: spec.photo ? photoUrl : null };
}

/** Render to SVG (string). Used by renderCard and by tests. */
export async function renderCardSvg({ template, fields, photoUrl, actor, logoUrl }) {
  const t = brandTheme(actor);
  if (logoUrl) t.logoUrl = logoUrl;
  if (t.logoUrl) t.logoUrl = await toDataUri(t.logoUrl).catch(() => null);
  const photo = await toDataUri(photoUrl);
  let svg = await satori(RENDERERS[template](fields, photo, t), { width: W, height: H, fonts: fonts() });
  if (template === "throwback" && photo) {
    // satori has no CSS filters; resvg does render SVG filters, so desaturate the photo element.
    svg = svg.replace(/<svg([^>]*)>/, '<svg$1><defs><filter id="bw"><feColorMatrix type="saturate" values="0.05"/><feComponentTransfer><feFuncR type="linear" slope="1.08"/><feFuncG type="linear" slope="1.08"/><feFuncB type="linear" slope="1.08"/></feComponentTransfer></filter></defs>');
    svg = svg.replace(/<image /, '<image filter="url(#bw)" ');
  }
  return svg;
}

/** Render to PNG. Returns { png: Buffer, width, height }. */
export async function renderCard(input) {
  const { template, fields, photoUrl } = normalizeCard(input);
  const svg = await renderCardSvg({ template, fields, photoUrl, actor: input.actor, logoUrl: input.logoUrl });
  const r = new Resvg(svg, { fitTo: { mode: "width", value: W }, font: { loadSystemFonts: false } });
  const png = r.render().asPng();
  return { png: Buffer.from(png), width: W, height: H };
}

/** Inline remote <image href="https://…"> references so resvg can draw them. */
async function inlineRemoteImages(svg) {
  const refs = Array.from(new Set(Array.from(svg.matchAll(/(?:xlink:href|href)=["'](https?:\/\/[^"']+)["']/g)).map((m) => m[1]))).slice(0, 8);
  let total = 0;
  for (const url of refs) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      total += buf.length;
      if (total > 12 * 1024 * 1024) break;
      const type = sniffImageType(buf) || (res.headers.get("content-type") || "image/png").split(";")[0];
      if (!["image/jpeg", "image/png", "image/gif"].includes(type)) continue;
      const uri = `data:${type};base64,${buf.toString("base64")}`;
      svg = svg.split(url).join(uri);
    } catch {}
  }
  return svg;
}

/**
 * Rasterize an SVG designed elsewhere (e.g. by Claude through the connector)
 * with the brand fonts (Oswald 500/700, Inter 500/800) available by family name.
 * Returns { png, width, height }.
 */
export async function renderSvgPng(svgInput, { width = W } = {}) {
  let svg = String(svgInput || "").trim();
  if (!svg.startsWith("<svg") && !svg.startsWith("<?xml")) throw new Error("Expected an <svg> document");
  if (svg.length > 2 * 1024 * 1024) throw new Error("SVG is too large (max 2 MB)");
  if (/<script[\s>]/i.test(svg)) throw new Error("SVG must not contain scripts");
  svg = await inlineRemoteImages(svg);
  const fontFiles = ["oswald-latin-700-normal.woff", "oswald-latin-500-normal.woff", "inter-latin-800-normal.woff", "inter-latin-500-normal.woff"].map((f) => path.join(FONT_DIR, f));
  const r = new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Oswald" } });
  const out = r.render();
  return { png: Buffer.from(out.asPng()), width: out.width, height: out.height };
}
