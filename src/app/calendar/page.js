"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import toast, { Toaster } from "react-hot-toast";
import { FiChevronLeft, FiChevronRight, FiLoader, FiX, FiCheck, FiRefreshCw, FiDownload, FiTrash2, FiEdit3, FiZap } from "react-icons/fi";
import { PLATFORMS, PLATFORM_INFO } from "@/lib/platforms";
import { addDays } from "@/lib/time";

const STATUS_COLORS = {
  planned: "bg-glass-hover text-muted",
  rendering: "bg-amber-500/10 text-amber-600",
  draft: "bg-sky-500/10 text-sky-600",
  approved: "bg-emerald-500/10 text-emerald-600",
  publishing: "bg-amber-500/10 text-amber-600",
  published: "bg-emerald-500/20 text-emerald-700",
  partial: "bg-amber-500/10 text-amber-700",
  failed: "bg-rose-500/10 text-rose-600",
  cancelled: "bg-glass-hover text-muted line-through",
};

function localYmd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekStart(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return addDays(ymd, -((dt.getDay() + 6) % 7)); // Monday
}
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function TargetEditor({ post, target, onChange }) {
  const [caption, setCaption] = useState(target.caption || "");
  const [title, setTitle] = useState(target.title || "");
  const [when, setWhen] = useState(new Date(target.scheduledAt).toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);
  const info = PLATFORM_INFO[target.platform];
  const locked = ["published", "publishing"].includes(target.status);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/targets/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, title: info.titleMax ? title : undefined, scheduledAt: new Date(when).toISOString() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Save failed");
      onChange(d);
      toast.success(`${info.label} updated`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-divider p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground"><span className="w-2.5 h-2.5 rounded-full" style={{ background: info.color }} /> {info.label} <span className="text-[10px] font-semibold text-muted">· {target.status}{target.url ? "" : ""}</span></div>
        {target.url && <a href={target.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary font-bold">View post</a>}
      </div>
      {target.error && <div className="text-[11px] text-rose-500">{target.error}</div>}
      {info.titleMax && <input disabled={locked} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full bg-bg-page border border-divider rounded px-2 py-1.5 text-xs" />}
      <textarea disabled={locked} rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} className="w-full bg-bg-page border border-divider rounded px-2 py-1.5 text-xs" />
      <div className="flex items-center gap-2">
        <input disabled={locked} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="bg-bg-page border border-divider rounded px-2 py-1 text-xs" />
        <span className="text-[10px] text-muted">{caption.length}/{info.captionMax}</span>
        <div className="flex-1" />
        {!locked && <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded bg-primary text-white text-[11px] font-bold disabled:opacity-50">{saving ? "…" : "Save"}</button>}
      </div>
    </div>
  );
}

function PostDrawer({ postId, onClose, onChanged }) {
  const [post, setPost] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = () => fetch(`/api/posts/${postId}`).then((r) => (r.ok ? r.json() : null)).then(setPost);
  useEffect(() => { load(); }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!post || !["planned", "rendering"].includes(post.status)) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [post?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (label, fn) => {
    setBusy(label);
    try {
      await fn();
      await load();
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };
  const patch = (body) => async () => {
    const res = await fetch(`/api/posts/${postId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Failed");
  };
  const post_ = (path, body = {}) => async () => {
    const res = await fetch(`/api/posts/${postId}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Failed");
  };

  if (!post) return <div className="p-10 flex justify-center"><FiLoader className="animate-spin text-primary" /></div>;
  const canApprove = ["draft", "failed", "partial"].includes(post.status) && (post.videoUrl || (post.mediaType === "image" && post.keyframeUrl));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-divider">
        <div className="flex items-center gap-3">
          <img src={post.actor.imageUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
          <div>
            <div className="text-sm font-black text-foreground">{post.actor.name} · {post.planDate}</div>
            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${STATUS_COLORS[post.status]}`}>{post.status}</span>
            <span className="text-[10px] text-muted ml-2">{post.mediaType} {post.clipLengthSec}s · ${(post.costCents / 100).toFixed(2)}</span>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-glass-hover"><FiX /></button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="aspect-[9/16] rounded-lg bg-black overflow-hidden flex items-center justify-center">
            {post.videoUrl ? <video src={post.videoUrl} controls playsInline className="w-full h-full object-contain" /> : post.keyframeUrl ? <img src={post.keyframeUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-xs text-white/60 p-4 text-center">{post.status === "failed" ? post.renderError : "Rendering…"}</span>}
          </div>
          <div className="space-y-2 text-xs">
            <div className="text-[11px] uppercase font-bold text-muted">Idea</div>
            <p className="text-foreground">{post.idea}</p>
            {post.script && (<>
              <div className="text-[11px] uppercase font-bold text-muted pt-2">Script</div>
              <p><strong>Hook:</strong> {post.script.hook}</p>
              <p><strong>Scene:</strong> {post.script.scene}</p>
              <p><strong>Action:</strong> {post.script.action}</p>
              {post.script.dialogue && <p><strong>Says:</strong> “{post.script.dialogue}”</p>}
              {post.script.onScreenText && <p><strong>On screen:</strong> {post.script.onScreenText}</p>}
            </>)}
            {post.keyframeQa && <p className="text-muted">Identity match {Math.round((post.keyframeQa.score || 0) * 100)}% ({post.keyframeQa.attempts} attempt{post.keyframeQa.attempts === 1 ? "" : "s"})</p>}
            {post.renderError && <p className="text-rose-500">{post.renderError}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canApprove && <button onClick={() => act("approve", patch({ status: "approved" }))} disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"><FiCheck /> Approve</button>}
          {post.status === "approved" && <button onClick={() => act("unapprove", patch({ status: "draft" }))} disabled={busy} className="px-4 py-2 rounded-lg border border-divider text-xs font-bold">Back to draft</button>}
          {(post.videoUrl || post.keyframeUrl) && <a href={post.videoUrl || post.keyframeUrl} download target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-lg border border-divider text-xs font-bold flex items-center gap-1"><FiDownload /> Download</a>}
          {post.script && post.status !== "rendering" && <button onClick={() => act("captions", post_("captions"))} disabled={busy} className="px-4 py-2 rounded-lg border border-divider text-xs font-bold flex items-center gap-1"><FiEdit3 /> Regenerate captions</button>}
          {post.status !== "rendering" && <button onClick={() => act("rerender", post_("render", { keepScript: true }))} disabled={busy} className="px-4 py-2 rounded-lg border border-divider text-xs font-bold flex items-center gap-1"><FiRefreshCw /> Re-render</button>}
          {post.status !== "rendering" && <button onClick={() => act("rerender-all", post_("render", { keepScript: false }))} disabled={busy} className="px-4 py-2 rounded-lg border border-divider text-xs font-bold flex items-center gap-1"><FiZap /> New script + render</button>}
          {!["published", "cancelled"].includes(post.status) && <button onClick={() => act("cancel", patch({ status: "cancelled" }))} disabled={busy} className="px-4 py-2 rounded-lg text-xs font-bold text-rose-500 flex items-center gap-1"><FiTrash2 /> Cancel</button>}
          {busy && <FiLoader className="animate-spin text-primary self-center" />}
        </div>

        <div className="space-y-2">
          <div className="text-[11px] uppercase font-bold text-muted">Per-platform captions and times</div>
          {post.targets.map((t) => <TargetEditor key={t.id} post={post} target={t} onChange={(nt) => setPost((p) => ({ ...p, targets: p.targets.map((x) => (x.id === nt.id ? nt : x)) }))} />)}
        </div>

        {post.events?.length > 0 && (
          <details className="text-[11px] text-muted">
            <summary className="cursor-pointer font-bold">Pipeline log ({post.events.length})</summary>
            <ul className="mt-2 space-y-1">{post.events.map((e) => <li key={e.id}>{new Date(e.createdAt).toLocaleTimeString()} · {e.step} · {e.status}{e.costCents ? ` · $${(e.costCents / 100).toFixed(2)}` : ""}{e.message ? ` · ${e.message}` : ""}</li>)}</ul>
          </details>
        )}
      </div>
    </div>
  );
}

function Calendar() {
  const searchParams = useSearchParams();
  const [start, setStart] = useState(() => weekStart(localYmd()));
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openPost, setOpenPost] = useState(searchParams.get("post"));
  const [actorFilter, setActorFilter] = useState("");
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);

  const load = () =>
    Promise.resolve()
      .then(() => setLoading(true))
      .then(() => fetch(`/api/posts?from=${days[0]}&to=${days[6]}`))
      .then((r) => (r.ok ? r.json() : []))
      .then(setPosts)
      .finally(() => setLoading(false));
  useEffect(() => { load(); }, [start]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!posts.some((p) => ["planned", "rendering"].includes(p.status))) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [posts]); // eslint-disable-line react-hooks/exhaustive-deps

  const actors = useMemo(() => {
    const m = new Map();
    posts.forEach((p) => m.set(p.actor.id, p.actor));
    return [...m.values()];
  }, [posts]);
  const visible = actorFilter ? posts.filter((p) => p.actor.id === actorFilter) : posts;
  const rows = actorFilter ? actors.filter((a) => a.id === actorFilter) : actors;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Toaster position="top-right" />
      <header className="flex items-center justify-between gap-3 p-4 border-b border-divider">
        <div className="flex items-center gap-2">
          <button onClick={() => setStart(addDays(start, -7))} className="p-2 rounded hover:bg-glass-hover"><FiChevronLeft /></button>
          <h1 className="text-sm font-black text-foreground">Week of {days[0]}</h1>
          <button onClick={() => setStart(addDays(start, 7))} className="p-2 rounded hover:bg-glass-hover"><FiChevronRight /></button>
          <button onClick={() => setStart(weekStart(localYmd()))} className="text-xs font-bold text-muted hover:text-foreground ml-2">Today</button>
        </div>
        <div className="flex items-center gap-2">
          <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} className="bg-bg-page border border-divider rounded px-2 py-1.5 text-xs">
            <option value="">All actors</option>
            {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={load} className="p-2 rounded border border-divider text-muted"><FiRefreshCw className={loading ? "animate-spin" : ""} /></button>
        </div>
      </header>

      <div className="flex-1 overflow-auto custom-scrollbar">
        {!loading && posts.length === 0 && (
          <div className="p-16 text-center text-xs text-muted">No posts this week. Open an actor and use <strong>Plan tomorrow now</strong>, or wait for the daily planner.</div>
        )}
        <div className="min-w-[980px] grid" style={{ gridTemplateColumns: "160px repeat(7, 1fr)" }}>
          <div className="sticky top-0 z-10 bg-bg-page border-b border-divider p-2" />
          {days.map((d) => <div key={d} className={`sticky top-0 z-10 bg-bg-page border-b border-l border-divider p-2 text-[11px] font-bold ${d === localYmd() ? "text-primary" : "text-muted"}`}>{new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</div>)}
          {rows.map((a) => (
            <div key={a.id} className="contents">
              <div className="border-b border-divider p-2 flex items-center gap-2">
                <img src={a.imageUrl} alt="" className="w-7 h-7 rounded-full object-cover bg-glass-hover" />
                <Link href={`/actors/${a.id}`} className="text-xs font-bold text-foreground hover:text-primary truncate">{a.name}</Link>
              </div>
              {days.map((d) => (
                <div key={d} className="border-b border-l border-divider p-1.5 space-y-1.5 min-h-[88px]">
                  {visible.filter((p) => p.actor.id === a.id && p.planDate === d).map((p) => (
                    <button key={p.id} onClick={() => setOpenPost(p.id)} className={`w-full text-left rounded-md border border-divider p-1.5 hover:shadow-md transition ${STATUS_COLORS[p.status]}`}>
                      <div className="flex gap-1.5">
                        <div className="w-8 h-11 rounded bg-black/10 overflow-hidden flex-shrink-0">{p.keyframeUrl && <img src={p.keyframeUrl} alt="" className="w-full h-full object-cover" />}</div>
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold truncate text-foreground">{p.hook || p.idea}</div>
                          <div className="text-[9px] uppercase font-black">{p.status}</div>
                          <div className="flex gap-0.5 mt-0.5">{PLATFORMS.filter((pl) => p.targets.some((t) => t.platform === pl)).map((pl) => { const t = p.targets.find((x) => x.platform === pl); return <span key={pl} title={`${PLATFORM_INFO[pl].label} ${fmtTime(t.scheduledAt)} · ${t.status}`} className="w-2 h-2 rounded-full" style={{ background: PLATFORM_INFO[pl].color, opacity: t.status === "published" ? 1 : t.status === "failed" ? 0.9 : 0.35 }} />; })}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {openPost && (
        <div className="fixed inset-0 z-[500] flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpenPost(null)} />
          <div className="relative w-full max-w-xl h-full bg-bg-card border-l border-divider shadow-2xl animate-fade-in">
            <PostDrawer postId={openPost} onClose={() => setOpenPost(null)} onChanged={load} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center"><FiLoader className="animate-spin text-primary text-2xl" /></div>}>
      <Calendar />
    </Suspense>
  );
}
