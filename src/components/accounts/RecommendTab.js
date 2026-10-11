"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { FiLoader, FiZap, FiBookmark, FiX, FiSend, FiExternalLink, FiEye, FiRefreshCw, FiTrash2 } from "react-icons/fi";
import { Section, ScoreBadge, inputCls, btnPrimary, btnGhost, fmt, pct } from "@/components/ui/form";
import { PLATFORM_INFO } from "@/lib/platforms";
import { DoInClaude } from "@/components/ui/ai-hint";
import CardMaker from "./CardMaker";

const RENDERING = ["planned", "rendering"];

/** The rendered preview of a recommendation's post: image/video, status, and the final schedule step. */
function PreviewPanel({ r, platforms, toggle, when, setWhen, onAction, busy }) {
  const p = r.post;
  const rendering = RENDERING.includes(p.status);
  const failed = p.status === "failed";
  const media = p.videoUrl || p.keyframeUrl;
  const card = r.visualBrief?.template;
  return (
    <div className="rounded-lg border border-primary/30 bg-bg-page p-3 grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
      <div className="aspect-[4/5] rounded-md bg-black/80 overflow-hidden flex items-center justify-center">
        {p.videoUrl ? <video src={p.videoUrl} controls playsInline className="w-full h-full object-contain" /> : p.keyframeUrl ? <img src={p.keyframeUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-[11px] text-white/70 p-3 text-center">{rendering ? <><FiLoader className="animate-spin inline mr-1" />Rendering{card ? " the card" : ""}…</> : failed ? "Render failed" : "No image yet"}</span>}
      </div>
      <div className="space-y-2 min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted flex items-center gap-2"><FiEye /> Preview · {rendering ? "rendering" : failed ? "failed" : "ready"}{card ? " · free card" : ""}</div>
        {failed && p.renderError && <p className="text-[11px] text-rose-500">{p.renderError}</p>}
        <pre className="whitespace-pre-wrap font-sans text-xs text-foreground bg-bg-card border border-divider rounded-lg p-2 max-h-40 overflow-auto">{r.caption}{r.hashtags?.length ? `\n\n${r.hashtags.map((h) => `#${h}`).join(" ")}` : ""}</pre>
        <p className="text-[11px] text-muted">Nothing is scheduled yet. Happy with it? Pick the platforms and a time, then schedule. It lands in the calendar as a draft and still needs your approval before it publishes.</p>
        <div className="flex flex-wrap items-center gap-2">
          {["instagram", "facebook"].map((k) => <label key={k} className="flex items-center gap-1 text-[11px] text-foreground"><input type="checkbox" checked={platforms.includes(k)} onChange={() => toggle(k)} className="accent-primary" />{PLATFORM_INFO[k].label}</label>)}
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="bg-bg-card border border-divider rounded px-2 py-1 text-[11px]" title="Leave empty to use the best time" />
          <span className="text-[10px] text-muted">{when ? "" : `empty = best time (${r.bestTime?.weekday || "weekday"} ${r.bestTime?.hourLocal ?? 10}:00)`}</span>
          <div className="flex-1" />
          <button onClick={() => onAction(r, "regenerate")} disabled={busy === r.id || rendering} className={btnGhost} title="Render it again (uses render credits unless it is a card)"><FiRefreshCw /> Regenerate</button>
          <button onClick={() => onAction(r, "discard-preview")} disabled={busy === r.id} className={btnGhost}><FiTrash2 /> Discard</button>
          <button onClick={() => onAction(r, "schedule", { platforms, date: when ? new Date(when).toISOString() : undefined })} disabled={busy === r.id || !platforms.length || rendering || failed} className={btnPrimary}>{busy === r.id ? <FiLoader className="animate-spin" /> : <FiSend />} Schedule</button>
        </div>
      </div>
    </div>
  );
}

function RecCard({ r, onAction, busy }) {
  const [edit, setEdit] = useState(false);
  const [caption, setCaption] = useState(r.caption || "");
  const [platforms, setPlatforms] = useState(r.platforms);
  const [when, setWhen] = useState("");
  const toggle = (p) => setPlatforms((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]));
  const previewing = r.status !== "used" && r.post && r.post.preview && r.post.status !== "cancelled";
  const isCard = Boolean(r.visualBrief?.template);
  return (
    <div className={`rounded-xl border bg-bg-card p-4 space-y-3 ${r.status === "used" ? "border-emerald-500/40" : r.status === "saved" ? "border-primary/40" : "border-divider"}`}>
      <div className="flex items-start gap-3">
        <div className="text-center"><ScoreBadge score={r.predictedScore} size="lg" /><div className="text-[9px] uppercase font-bold text-muted mt-1">predicted</div></div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black text-foreground">{r.title}</div>
          <div className="text-[11px] text-muted flex flex-wrap gap-x-3">
            <span>{r.format}</span>
            {r.platforms.map((p) => <span key={p} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_INFO[p]?.color }} />{PLATFORM_INFO[p]?.label}</span>)}
            <span>reach {fmt(r.predictedReachLow)}–{fmt(r.predictedReachHigh)}</span>
            <span>ER {pct(r.predictedEngagementRate, 2)}</span>
            <span>confidence {Math.round((r.confidence || 0) * 100)}%</span>
            {r.bestTime && <span>best: {r.bestTime.weekday} {r.bestTime.hourLocal}:00</span>}
            {r.basedOn?.seasonalHook && <span className="text-amber-600 font-bold">{r.basedOn.seasonalHook}</span>}
          </div>
        </div>
        {r.status === "used" && r.post && <Link href={`/calendar?post=${r.post.id}`} className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">post {r.post.status} <FiExternalLink /></Link>}
        {r.actualScore != null && <div className="text-center"><ScoreBadge score={r.actualScore} /><div className="text-[9px] uppercase font-bold text-muted mt-1">actual</div></div>}
      </div>
      <p className="text-xs text-foreground">{r.concept}</p>
      <details className="text-xs">
        <summary className="cursor-pointer font-bold text-primary">Caption, visual brief and rationale</summary>
        <div className="mt-2 space-y-2">
          {edit ? <textarea rows={6} value={caption} onChange={(e) => setCaption(e.target.value)} className={inputCls} /> : <pre className="whitespace-pre-wrap font-sans bg-bg-page border border-divider rounded-lg p-3 text-foreground">{r.caption}{r.hashtags?.length ? `\n\n${r.hashtags.map((h) => `#${h}`).join(" ")}` : ""}</pre>}
          {r.visualBrief && <p className="text-muted"><strong className="text-foreground">Visual:</strong> {r.visualBrief.subject}. {r.visualBrief.composition}. {r.visualBrief.overlayText ? `Overlay: “${r.visualBrief.overlayText}”. ` : ""}{r.visualBrief.notes}</p>}
          <p className="text-muted"><strong className="text-foreground">Why:</strong> {r.rationale}</p>
          {(r.basedOn?.ownPosts?.length || r.basedOn?.benchmarks?.length) ? <p className="text-[11px] text-muted">Based on {r.basedOn.ownPosts?.length || 0} of our posts and {r.basedOn.benchmarks?.length || 0} competitor posts.</p> : null}
        </div>
      </details>
      {previewing && <PreviewPanel r={r} platforms={platforms} toggle={toggle} when={when} setWhen={setWhen} onAction={onAction} busy={busy} />}
      {r.status !== "used" && !previewing && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted">{isCard ? "Preview is free (brand card template)." : "Preview renders the image with render credits; nothing is scheduled until you say so."}</span>
          <div className="flex-1" />
          {edit ? <button onClick={() => { onAction(r, "save-edit", { caption }); setEdit(false); }} className={btnGhost}>Save caption</button> : <button onClick={() => setEdit(true)} className={btnGhost}>Edit caption</button>}
          <button onClick={() => onAction(r, r.status === "saved" ? "unsave" : "save")} disabled={busy === r.id} className={btnGhost}><FiBookmark /> {r.status === "saved" ? "Saved" : "Save"}</button>
          <button onClick={() => onAction(r, "dismiss")} disabled={busy === r.id} className={btnGhost}><FiX /> Dismiss</button>
          <button onClick={() => onAction(r, "preview")} disabled={busy === r.id} className={btnPrimary}>{busy === r.id ? <FiLoader className="animate-spin" /> : <FiEye />} Preview post</button>
        </div>
      )}
    </div>
  );
}

export default function RecommendTab({ actor, reload }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [filter, setFilter] = useState("");
  const [focus, setFocus] = useState("");
  const [count, setCount] = useState(10);
  const load = () => fetch(`/api/accounts/${actor.id}/recommendations${filter ? `?status=${filter}` : ""}`).then((r) => (r.ok ? r.json() : null)).then(setData);
  useEffect(() => { load(); }, [actor.id, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  // While a preview is rendering, refresh every few seconds so the image appears without a reload.
  const rendering = Boolean(data?.items?.some((r) => r.post?.preview && RENDERING.includes(r.post.status)));
  useEffect(() => {
    if (!rendering) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [rendering]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    setBusy("generate");
    try {
      const res = await fetch(`/api/accounts/${actor.id}/recommendations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count, focus }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success(`${d.recommendations.length} recommendations added`);
      setFocus("");
      await load();
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const onAction = async (r, action, extra = {}) => {
    setBusy(r.id);
    try {
      let res;
      const post = (body) => fetch(`/api/recommendations/${r.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (action === "preview") res = await post({ action: "preview" });
      else if (action === "schedule") res = await post({ action: "schedule", ...extra });
      else if (action === "discard-preview") res = await post({ action: "discard-preview" });
      else if (action === "regenerate") res = await fetch(`/api/posts/${r.post.id}/render`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keepScript: true }) });
      else if (action === "create") res = await post({ action: "create-post", ...extra });
      else if (action === "save-edit") res = await fetch(`/api/recommendations/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(extra) });
      else res = await fetch(`/api/recommendations/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: action === "save" ? "saved" : action === "unsave" ? "suggested" : "dismissed" }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      if (action === "preview") toast.success(r.visualBrief?.template ? "Rendering the card…" : "Rendering the preview…");
      if (action === "regenerate") toast.success("Rendering again…");
      if (action === "discard-preview") toast.success("Preview discarded");
      if (action === "schedule" || action === "create") {
        const issues = Object.values(d.compliance || {}).flatMap((c) => c.issues || []);
        toast.success(issues.length ? `Scheduled as a draft; compliance notes: ${issues[0]}` : action === "schedule" ? "Scheduled as a draft. Approve it in the calendar when you're ready." : "Post created; rendering now. Approve it in the calendar.");
      }
      await load();
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <div className="py-16 flex justify-center"><FiLoader className="animate-spin text-primary" /></div>;
  const hasData = actor._count.channelPosts > 0;

  return (
    <div className="space-y-4">
      <Section title="Recommended posts" hint="Claude studies our top and bottom posts, the competitors' best posts, the next 30 days of seasonal moments and its own past prediction accuracy, then proposes posts with a predicted 1–10 score and reach range.">
        <div className="flex flex-wrap gap-2 items-center">
          <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Optional focus, e.g. 'turkey season launch', 'reels only', 'winner announcements'" className="flex-1 min-w-[240px] bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm" />
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm">{[5, 10, 15].map((n) => <option key={n} value={n}>{n} ideas</option>)}</select>
          <button onClick={generate} disabled={busy === "generate" || !hasData} className={btnPrimary}>{busy === "generate" ? <FiLoader className="animate-spin" /> : <FiZap />} Generate</button>
        </div>
        {!hasData && <p className="text-[11px] text-amber-600">Import the account history first so recommendations are grounded in real numbers.</p>}
        <DoInClaude prompt="recommend-posts" brandId={actor.id} what="recommendations with predicted scores land here" />
        <DoInClaude prompt="write-winner-post" brandId={actor.id} what="write and schedule a post in the brand style" />
        {data.calibration && <p className="text-[11px] text-muted">Past accuracy: {data.calibration.n} published, MAE {data.calibration.mae}, bias {data.calibration.bias}.</p>}
      </Section>
      <CardMaker actor={actor} onCreated={() => { load(); reload(); }} />
      <div className="flex gap-1 text-xs">
        {[["", "Library"], ["saved", "Saved"], ["used", "Used"], ["dismissed", "Dismissed"]].map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-full font-bold ${filter === k ? "bg-primary text-white" : "border border-divider text-muted"}`}>{l}</button>)}
      </div>
      {data.items.length === 0 ? <p className="text-xs text-muted text-center py-10">Nothing here yet.</p> : <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{data.items.map((r) => <RecCard key={r.id} r={r} onAction={onAction} busy={busy} />)}</div>}
    </div>
  );
}
