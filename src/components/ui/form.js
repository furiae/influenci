"use client";

/** Small form primitives shared by actor and brand pages (inline Tailwind, same look as /actors). */
export const inputCls = "w-full bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm outline-none focus:border-primary";
export const btnPrimary = "px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold disabled:opacity-50 flex items-center gap-2";
export const btnGhost = "px-4 py-2 rounded-lg border border-divider text-xs font-bold text-muted hover:text-foreground disabled:opacity-50 flex items-center gap-2";

export const Field = ({ label, children, hint }) => (
  <label className="block space-y-1">
    <span className="text-[11px] uppercase font-bold text-muted tracking-wider">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-muted">{hint}</span>}
  </label>
);

export const Section = ({ title, hint, right, children }) => (
  <section className="rounded-xl border border-divider bg-bg-card p-5 space-y-4">
    {(title || right) && (
      <div className="flex items-start justify-between gap-3">
        <div>
          {title && <h3 className="text-sm font-black text-foreground">{title}</h3>}
          {hint && <p className="text-[11px] text-muted">{hint}</p>}
        </div>
        {right}
      </div>
    )}
    {children}
  </section>
);

export const listToText = (arr) => (Array.isArray(arr) ? arr.join("\n") : "");
export const textToList = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);

export const fmt = (n) => (n == null ? "–" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));
export const pct = (x, d = 1) => (x == null ? "–" : `${(x * 100).toFixed(d)}%`);
export const when = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "–");

/** 1-10 success score badge, colour-ramped. */
export function ScoreBadge({ score, provisional, size = "md" }) {
  if (score == null) return <span className={`inline-flex items-center justify-center rounded-md font-black bg-glass-hover text-muted ${size === "lg" ? "w-12 h-12 text-lg" : "w-8 h-8 text-xs"}`}>–</span>;
  const cls = score >= 8 ? "bg-emerald-500 text-white" : score >= 6 ? "bg-lime-500 text-black" : score >= 4 ? "bg-amber-400 text-black" : "bg-rose-500 text-white";
  return (
    <span title={provisional ? "Provisional: post is younger than 72 h" : `${score}/10`} className={`inline-flex items-center justify-center rounded-md font-black ${cls} ${provisional ? "opacity-60 ring-2 ring-dashed ring-current" : ""} ${size === "lg" ? "w-12 h-12 text-lg" : "w-8 h-8 text-xs"}`}>
      {score}
    </span>
  );
}

export const PLATFORM_DOT = { instagram: "#E1306C", facebook: "#1877F2", youtube: "#FF0000", x: "#000", tiktok: "#010101", pinterest: "#E60023" };
