"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import toast from "react-hot-toast";
import { FiLoader, FiExternalLink, FiX, FiZap, FiRefreshCw, FiUpload } from "react-icons/fi";
import { PLATFORM_INFO } from "@/lib/platforms";
import { Section, ScoreBadge, fmt, pct, when, btnPrimary, btnGhost } from "@/components/ui/form";

const SORTS = [["score", "Score"], ["date", "Newest"], ["er", "Engagement rate"], ["reach", "Reach"]];

export function PostCard({ p, onOpen }) {
  return (
    <button onClick={() => onOpen(p)} className="text-left rounded-lg border border-divider overflow-hidden bg-bg-page hover:shadow-md flex flex-col">
      <div className="aspect-square bg-glass-hover relative">
        {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" /> : <div className="absolute inset-0 p-3 text-[11px] text-muted line-clamp-6">{p.caption}</div>}
        <div className="absolute top-2 left-2"><ScoreBadge score={p.score} provisional={p.scoreBreakdown?.provisional} /></div>
        <span className="absolute top-2 right-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-black/60 text-white">{p.mediaType}</span>
      </div>
      <div className="p-2 space-y-1 flex-1">
        <div className="text-[10px] font-bold text-muted flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_INFO[p.platform]?.color }} /> {when(p.postedAt)}{p.source === "influenci" ? " · Influenci" : p.source === "screenshot" ? " · screenshot" : ""}</div>
        <div className="text-[11px] text-foreground line-clamp-2">{p.caption || "(no caption)"}</div>
        <div className="text-[10px] text-muted">{pct(p.engagementRate)} ER · reach {fmt(p.reach)} · {fmt(p.likes)} likes · {fmt(p.comments)} comments{p.shares ? ` · ${fmt(p.shares)} shares` : ""}{p.saves ? ` · ${fmt(p.saves)} saves` : ""}</div>
      </div>
    </button>
  );
}

export function PostDrawer({ actorId, post, onClose, onLike }) {
  const [full, setFull] = useState(post);
  const [busy, setBusy] = useState(null);
  useEffect(() => { fetch(`/api/accounts/${actorId}/posts/${post.id}`).then((r) => (r.ok ? r.json() : post)).then(setFull); }, [actorId, post]);
  const analyze = async () => {
    setBusy("analyze");
    try {
      const res = await fetch(`/api/accounts/${actorId}/posts/${post.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "analyze" }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setFull((f) => ({ ...f, analysis: d.analysis }));
      toast.success("Analysed");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };
  const a = full.analysis;
  const bd = full.scoreBreakdown || {};
  const series = full.metrics || [];
  return (
    <div className="fixed inset-0 z-[900] flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl bg-bg-card border-l border-divider overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between p-4 border-b border-divider">
          <div className="flex items-center gap-3"><ScoreBadge score={full.score} provisional={bd.provisional} size="lg" /><div><div className="text-sm font-bold text-foreground">{PLATFORM_INFO[full.platform]?.label} {full.mediaType}</div><div className="text-[11px] text-muted">{when(full.postedAt)} · {full.url && <a href={full.url} target="_blank" rel="noopener noreferrer" className="text-primary font-bold inline-flex items-center gap-1">open <FiExternalLink /></a>}</div></div></div>
          <button onClick={onClose} className="text-muted hover:text-foreground"><FiX /></button>
        </div>
        <div className="p-4 space-y-4">
          {full.thumbnailUrl && <img src={full.thumbnailUrl} alt="" className="w-full rounded-lg border border-divider" />}
          <div className="grid grid-cols-4 gap-2 text-center">
            {[["Likes", fmt(full.likes)], ["Comments", fmt(full.comments)], ["Shares", fmt(full.shares)], ["Saves", fmt(full.saves)], ["Reach", fmt(full.reach)], ["Views", fmt(full.views)], ["ER", pct(full.engagementRate, 2)], ["Reach rate", pct(full.reachRate)]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-bg-page p-2"><div className="text-sm font-black text-foreground">{v}</div><div className="text-[9px] uppercase font-bold text-muted">{k}</div></div>
            ))}
          </div>
          <div className="text-[11px] text-muted">Score = 50% rank among this account&apos;s posts ({bd.relative ?? "–"}/10) + 30% industry benchmark ({bd.absolute ?? "–"}/10) + 20% reach ({bd.reach ?? "–"}/10){bd.provisional ? " · provisional, post is under 72 h old" : ""}.</div>
          {series.length > 1 && <div className="text-[11px] text-muted">Growth: {series[0].likes}→{series[series.length - 1].likes} likes over {series.length} snapshots since {when(series[0].capturedAt)}.</div>}
          <pre className="whitespace-pre-wrap text-xs text-foreground bg-bg-page rounded-lg p-3 border border-divider font-sans">{full.caption || "(no caption)"}</pre>
          <div className="flex gap-2">
            <button onClick={() => onLike(full)} className={btnPrimary}><FiZap /> Make a post like this</button>
            <button onClick={analyze} disabled={busy} className={btnGhost}>{busy ? <FiLoader className="animate-spin" /> : <FiRefreshCw />} {a ? "Re-analyse" : "Analyse with Claude"}</button>
          </div>
          {a && (
            <div className="rounded-lg border border-divider p-3 space-y-1.5 text-xs text-foreground">
              <div className="font-black text-sm">{a.format} · {a.activity}</div>
              <p><strong>Hook:</strong> {a.hook}</p>
              <p><strong>Why it worked:</strong> {a.whyItWorks}</p>
              <p><strong>Composition:</strong> {a.composition}</p>
              <p><strong>Caption style:</strong> {a.captionStyle} · CTA: {a.ctaType}</p>
              {a.hasTextOverlay && <p><strong>Overlay:</strong> “{a.overlayText}”</p>}
              {a.palette?.length > 0 && <div className="flex gap-1 items-center"><strong>Palette:</strong> {a.palette.map((c) => <span key={c} className="w-4 h-4 rounded border border-divider" style={{ background: c }} title={c} />)}</div>}
              {a.improvements?.length > 0 && <div><strong>Do better:</strong><ul className="list-disc ml-4">{a.improvements.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ScreenshotImport({ actor, onDone }) {
  const fileRef = useRef(null);
  const [platform, setPlatform] = useState("facebook");
  const [busy, setBusy] = useState(null);
  const pick = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 40);
    e.target.value = "";
    if (!files.length) return;
    setBusy(`Uploading ${files.length}…`);
    try {
      const urls = [];
      for (const f of files) {
        const blob = await upload(`screenshots/${actor.id}/${Date.now()}-${f.name}`, f, { access: "public", handleUploadUrl: "/api/upload" });
        urls.push(blob.url);
      }
      setBusy(`Reading ${urls.length} screenshot${urls.length === 1 ? "" : "s"} with Claude…`);
      const res = await fetch(`/api/accounts/${actor.id}/posts/screenshots`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls, platform }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Import failed");
      toast.success(`${d.posts} post${d.posts === 1 ? "" : "s"} recorded${d.errors?.length ? `, ${d.errors.length} screenshot(s) failed` : ""}`);
      onDone?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="bg-bg-page border border-divider rounded-lg px-2 py-2 text-xs"><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option></select>
      <button onClick={() => fileRef.current?.click()} disabled={Boolean(busy)} className={btnPrimary} title="Screenshots of posts (one or several per image). Claude reads the caption, date, likes, comments and shares.">{busy ? <FiLoader className="animate-spin" /> : <FiUpload />} {busy || "Import from screenshots"}</button>
      <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} />
    </div>
  );
}

export default function PostsTab({ actor }) {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ platform: "", format: "", minScore: "", sort: "score", q: "" });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [liking, setLiking] = useState(false);

  const load = () => {
    const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page: String(page), limit: "48" });
    fetch(`/api/accounts/${actor.id}/posts?${q}`).then((r) => (r.ok ? r.json() : null)).then(setData);
  };
  useEffect(() => { load(); }, [actor.id, filters, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const like = async (p) => {
    setLiking(true);
    try {
      const res = await fetch(`/api/accounts/${actor.id}/recommendations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelPostId: p.id }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success("Recommendation created. See the Recommend tab.");
      setOpen(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLiking(false);
    }
  };

  if (!data) return <div className="py-16 flex justify-center"><FiLoader className="animate-spin text-primary" /></div>;
  const set = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })); };
  const pages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <div className="space-y-4">
      <Section>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={filters.platform} onChange={set("platform")} className="bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm"><option value="">All platforms</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option></select>
          <select value={filters.format} onChange={set("format")} className="bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm"><option value="">All formats</option>{data.formats.map((f) => <option key={f.key} value={f.key}>{f.key} ({f.n})</option>)}</select>
          <select value={filters.minScore} onChange={set("minScore")} className="bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm"><option value="">Any score</option>{[8, 6, 4].map((s) => <option key={s} value={s}>score ≥ {s}</option>)}</select>
          <select value={filters.sort} onChange={set("sort")} className="bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm">{SORTS.map(([k, l]) => <option key={k} value={k}>Sort: {l}</option>)}</select>
          <input value={filters.q} onChange={set("q")} placeholder="Search captions" className="flex-1 min-w-[160px] bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm" />
          <span className="text-[11px] text-muted">{data.total} posts</span>
          <ScreenshotImport actor={actor} onDone={load} />
        </div>
      </Section>
      {data.items.length === 0 ? (
        <p className="text-xs text-muted text-center py-10">No posts yet. Connect a channel and import its history, or drop screenshots of posts with the button above.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">{data.items.map((p) => <PostCard key={p.id} p={p} onOpen={setOpen} />)}</div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className={btnGhost}>Prev</button>
          <span className="text-muted">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className={btnGhost}>Next</button>
        </div>
      )}
      {open && <PostDrawer actorId={actor.id} post={open} onClose={() => setOpen(null)} onLike={liking ? () => {} : like} />}
    </div>
  );
}
