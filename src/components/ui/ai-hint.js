"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FiCopy, FiCheck, FiMessageSquare } from "react-icons/fi";

let cache = null;
let inflight = null;

/** Reads /api/settings/ai once per page and shares it between tabs. */
export function useAiMode() {
  const [state, setState] = useState(cache);
  useEffect(() => {
    if (cache) return;
    inflight ||= fetch("/api/settings/ai").then((r) => (r.ok ? r.json() : null)).then((d) => { cache = d; return d; }).catch(() => null);
    inflight.then((d) => setState(d));
  }, []);
  return state;
}

export function invalidateAiMode() { cache = null; inflight = null; }

export function CopyField({ value }) {
  const [done, setDone] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 max-w-full">
      <code className="bg-bg-page border border-divider rounded px-2 py-1 text-[11px] truncate">{value}</code>
      <button type="button" onClick={() => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }} className="p-1 rounded border border-divider text-muted hover:text-foreground" title="Copy">{done ? <FiCheck className="text-emerald-500" /> : <FiCopy />}</button>
    </span>
  );
}

/**
 * "Do this in Claude" hint, shown where a button would otherwise spend API
 * tokens. Renders nothing in API mode.
 */
export function DoInClaude({ prompt, brandId, what }) {
  const ai = useAiMode();
  if (!ai || ai.mode !== "subscription") return null;
  const line = brandId ? `Use the Influenci connector: run the "${prompt}" prompt for brand ${brandId}` : `Use the Influenci connector: run the "${prompt}" prompt`;
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs space-y-1.5">
      <div className="flex items-center gap-2 font-bold text-foreground"><FiMessageSquare className="text-primary" /> Do this in Claude{what ? ` · ${what}` : ""}</div>
      <p className="text-muted">AI mode is set to your Claude subscription, so this runs in Claude.ai or Claude Code through the Influenci connector instead of billing the API. Open Claude with the connector added and paste:</p>
      <CopyField value={line} />
      <p className="text-[11px] text-muted">Connector URL <CopyField value={ai.connector} /> · <Link href="/settings/platforms#ai" className="text-primary font-bold">setup &amp; switch mode</Link></p>
    </div>
  );
}
