"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FiLoader, FiZap, FiRefreshCw, FiCheck, FiX } from "react-icons/fi";
import { Field, Section, inputCls, btnPrimary, btnGhost, listToText, textToList } from "@/components/ui/form";

function Palette({ palette, onChange }) {
  const set = (i, k, v) => onChange(palette.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  return (
    <div className="flex flex-wrap gap-2">
      {palette.map((p, i) => (
        <div key={i} className="flex items-center gap-1 rounded-lg border border-divider p-1.5 bg-bg-page">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(p.hex) ? p.hex : "#000000"} onChange={(e) => set(i, "hex", e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" />
          <input value={p.hex} onChange={(e) => set(i, "hex", e.target.value)} className="w-20 bg-transparent text-[11px] font-mono outline-none" />
          <input value={p.role} onChange={(e) => set(i, "role", e.target.value)} className="w-20 bg-transparent text-[11px] outline-none text-muted" />
          <button onClick={() => onChange(palette.filter((_, j) => j !== i))} className="text-muted hover:text-rose-500"><FiX size={12} /></button>
        </div>
      ))}
      <button onClick={() => onChange([...palette, { hex: "#000000", role: "accent" }])} className="text-[11px] font-bold text-primary">+ colour</button>
    </div>
  );
}

export default function DesignTab({ actor, reload }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = () => fetch(`/api/accounts/${actor.id}/design`).then((r) => (r.ok ? r.json() : null)).then((d) => { setData(d); setForm(d?.designSystem ? toForm(d.designSystem) : null); });
  useEffect(() => { load(); }, [actor.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (action, extra = {}, ok) => {
    setBusy(action);
    try {
      const res = await fetch(`/api/accounts/${actor.id}/design`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success(ok || "Done");
      await load();
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    setBusy("save");
    try {
      const res = await fetch(`/api/accounts/${actor.id}/design`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fromForm(form)) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success(`Saved as v${d.designSystem.version}`);
      await load();
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <div className="py-16 flex justify-center"><FiLoader className="animate-spin text-primary" /></div>;
  const ds = data.designSystem;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      <Section title={ds ? `Design system · v${ds.version}` : "Design system"} hint="Extracted from the account's best posts, then yours to edit. Captions and generated images follow it. Each sync compares new top posts with it and proposes changes below." right={
        <div className="flex gap-2">
          <button onClick={() => act("extract", {}, "Design system extracted")} disabled={busy} className={ds ? btnGhost : btnPrimary}>{busy === "extract" ? <FiLoader className="animate-spin" /> : <FiZap />} {ds ? "Re-extract from top posts" : "Extract from top posts"}</button>
          {ds && <button onClick={() => act("learn", {}, "Checked new posts for changes")} disabled={busy} className={btnGhost}>{busy === "learn" ? <FiLoader className="animate-spin" /> : <FiRefreshCw />} Learn from new posts</button>}
        </div>
      }>
        {!ds && <p className="text-xs text-muted">Import the history first, then extract. Needs a few posts with images.</p>}
        {ds?.summary && <p className="text-xs text-foreground">{ds.summary}</p>}
      </Section>

      {ds?.pendingSuggestions?.length > 0 && (
        <Section title="Suggested changes from recent top posts" hint="Accept to fold them into a new version; reject to drop them.">
          {ds.pendingSuggestions.map((s) => (
            <div key={s.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 text-xs">
              <div className="text-foreground">{s.summary}</div>
              <ul className="list-disc ml-4 text-muted">{s.diffs.map((d) => <li key={d.key}><strong className="text-foreground">{d.key}</strong>: {typeof d.proposed === "string" ? d.proposed : JSON.stringify(d.proposed).slice(0, 220)}</li>)}</ul>
              <div className="flex gap-2"><button onClick={() => act("accept", { suggestionId: s.id }, "Applied")} disabled={busy} className={btnPrimary}><FiCheck /> Accept all</button><button onClick={() => act("reject", { suggestionId: s.id }, "Dropped")} disabled={busy} className={btnGhost}><FiX /> Reject</button></div>
            </div>
          ))}
        </Section>
      )}

      {form && (
        <>
          <Section title="Visual">
            <Field label="Palette"><Palette palette={form.palette} onChange={(palette) => setForm((f) => ({ ...f, palette }))} /></Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Text overlay style"><textarea rows={2} value={form.overlayStyle} onChange={set("overlayStyle")} className={inputCls} /></Field>
              <Field label="Case style"><input value={form.caseStyle} onChange={set("caseStyle")} className={inputCls} /></Field>
              <Field label="Logo placement"><input value={form.logoPlacement} onChange={set("logoPlacement")} className={inputCls} /></Field>
              <Field label="When text overlays are used"><textarea rows={2} value={form.overlayRules} onChange={set("overlayRules")} className={inputCls} /></Field>
              <Field label="Imagery subjects (one per line)"><textarea rows={4} value={form.subjects} onChange={set("subjects")} className={inputCls} /></Field>
              <Field label="Imagery styles"><textarea rows={4} value={form.styles} onChange={set("styles")} className={inputCls} /></Field>
              <Field label="Framing"><textarea rows={3} value={form.framing} onChange={set("framing")} className={inputCls} /></Field>
              <Field label="Layout patterns"><textarea rows={3} value={form.layoutPatterns} onChange={set("layoutPatterns")} className={inputCls} /></Field>
            </div>
          </Section>
          <Section title="Captions & voice">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Typical length"><input value={form.length} onChange={set("length")} className={inputCls} /></Field>
              <Field label="Structure"><input value={form.structure} onChange={set("structure")} className={inputCls} /></Field>
              <Field label="Openers that work"><textarea rows={3} value={form.openers} onChange={set("openers")} className={inputCls} /></Field>
              <Field label="CTA patterns"><textarea rows={3} value={form.ctaPatterns} onChange={set("ctaPatterns")} className={inputCls} /></Field>
              <Field label="Emoji usage"><input value={form.emoji} onChange={set("emoji")} className={inputCls} /></Field>
              <Field label="Posting rhythm"><input value={form.postingRhythm} onChange={set("postingRhythm")} className={inputCls} /></Field>
              <Field label="Core hashtags"><textarea rows={3} value={form.coreTags} onChange={set("coreTags")} className={inputCls} /></Field>
              <Field label="Seasonal hashtags"><textarea rows={3} value={form.seasonalTags} onChange={set("seasonalTags")} className={inputCls} /></Field>
              <Field label="Never"><textarea rows={3} value={form.doNots} onChange={set("doNots")} className={inputCls} /></Field>
              <Field label="Summary"><textarea rows={3} value={form.summary} onChange={set("summary")} className={inputCls} /></Field>
            </div>
          </Section>
          <div className="flex justify-end"><button onClick={save} disabled={busy} className={btnPrimary}>{busy === "save" ? "Saving…" : "Save as new version"}</button></div>
        </>
      )}

      {data.history?.length > 0 && (
        <Section title="Versions">
          <div className="text-[11px] text-muted divide-y divide-divider">{data.history.map((h) => <div key={h.id} className="py-1.5 flex gap-3"><span className="font-bold text-foreground">{h.message}</span><span>{new Date(h.createdAt).toLocaleString()}</span></div>)}</div>
        </Section>
      )}
    </div>
  );
}

function toForm(ds) {
  return {
    palette: ds.palette || [], overlayStyle: ds.typography?.overlayStyle || "", caseStyle: ds.typography?.caseStyle || "", logoPlacement: ds.logoPlacement || "", overlayRules: ds.overlayRules || "",
    subjects: listToText(ds.imagery?.subjects), styles: listToText(ds.imagery?.styles), framing: listToText(ds.imagery?.framing), layoutPatterns: listToText(ds.layoutPatterns),
    length: ds.captionStyle?.length || "", structure: ds.captionStyle?.structure || "", openers: listToText(ds.captionStyle?.openers), ctaPatterns: listToText(ds.captionStyle?.ctaPatterns), emoji: ds.captionStyle?.emoji || "",
    coreTags: listToText(ds.captionStyle?.hashtagSets?.core), seasonalTags: listToText(ds.captionStyle?.hashtagSets?.seasonal), postingRhythm: ds.postingRhythm || "", doNots: listToText(ds.doNots), summary: ds.summary || "",
  };
}

function fromForm(f) {
  return {
    palette: f.palette, typography: { overlayStyle: f.overlayStyle, caseStyle: f.caseStyle }, logoPlacement: f.logoPlacement, overlayRules: f.overlayRules,
    imagery: { subjects: textToList(f.subjects), styles: textToList(f.styles), framing: textToList(f.framing) }, layoutPatterns: textToList(f.layoutPatterns),
    captionStyle: { length: f.length, structure: f.structure, openers: textToList(f.openers), ctaPatterns: textToList(f.ctaPatterns), emoji: f.emoji, hashtagSets: { core: textToList(f.coreTags), seasonal: textToList(f.seasonalTags) } },
    postingRhythm: f.postingRhythm, doNots: textToList(f.doNots), summary: f.summary,
  };
}
