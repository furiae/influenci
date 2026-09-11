"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FiPlus, FiRefreshCw, FiTrash2, FiLoader, FiExternalLink, FiAlertCircle } from "react-icons/fi";
import { PLATFORMS, PLATFORM_INFO } from "@/lib/platforms";

const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

export default function CompetitorsTab({ actor }) {
  const [data, setData] = useState(null);
  const [platform, setPlatform] = useState("youtube");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(null);

  const load = () => fetch(`/api/actors/${actor.id}/competitors`).then((r) => (r.ok ? r.json() : null)).then(setData);
  useEffect(() => { load(); }, [actor.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e) => {
    e.preventDefault();
    if (!handle.trim()) return;
    setBusy("add");
    try {
      const res = await fetch(`/api/actors/${actor.id}/competitors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform, handle }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setHandle("");
      await load();
      // fetch right away
      const r2 = await fetch(`/api/competitors/${d.id}`, { method: "POST" });
      const d2 = await r2.json();
      if (!r2.ok) toast.error(d2.error || "Added, but fetch failed");
      else toast.success(`Added @${d.handle} (${d2.fetched ?? 0} posts)`);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const refreshAll = async () => {
    setBusy("refresh");
    try {
      const res = await fetch(`/api/actors/${actor.id}/competitors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh" }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      const errors = d.results.filter((r) => r.error);
      toast[errors.length ? "error" : "success"](errors.length ? `${errors.length} account(s) failed: ${errors[0].error}` : "Benchmarks refreshed");
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (c) => {
    if (!confirm(`Remove @${c.handle}?`)) return;
    await fetch(`/api/competitors/${c.id}`, { method: "DELETE" });
    load();
  };

  if (!data) return <div className="py-16 flex justify-center"><FiLoader className="animate-spin text-primary" /></div>;
  const supported = (p) => data.support?.[p]?.supported;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-divider bg-bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-foreground">Reference accounts</h3>
            <p className="text-[11px] text-muted">7–10 creators in this niche per platform. Their best-performing recent posts become benchmarks the writer studies before proposing ideas.</p>
          </div>
          <button onClick={refreshAll} disabled={busy || !data.competitors.length} className="px-4 py-2 rounded-lg border border-divider text-xs font-bold flex items-center gap-2 disabled:opacity-50">{busy === "refresh" ? <FiLoader className="animate-spin" /> : <FiRefreshCw />} Fetch all</button>
        </div>
        <form onSubmit={add} className="flex flex-wrap gap-2">
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm">
            {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_INFO[p].label}{supported(p) ? "" : " (manual)"}</option>)}
          </select>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle or profile URL" className="flex-1 min-w-[200px] bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm" />
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50">{busy === "add" ? <FiLoader className="animate-spin" /> : <FiPlus />} Add</button>
        </form>
        {!supported(platform) && <p className="text-[11px] text-amber-600 flex items-center gap-1"><FiAlertCircle /> {data.support[platform].needs}</p>}
        <div className="divide-y divide-divider">
          {data.competitors.length === 0 && <div className="py-6 text-xs text-muted text-center">No reference accounts yet.</div>}
          {data.competitors.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-2.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: PLATFORM_INFO[c.platform].color }} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-foreground truncate">@{c.handle} {c.displayName && <span className="text-muted font-normal">· {c.displayName}</span>} {c.followers != null && <span className="text-muted font-normal">· {fmt(c.followers)} followers</span>}</div>
                <div className="text-[11px] text-muted truncate">{c._count.posts} posts · {c.lastFetchedAt ? `fetched ${new Date(c.lastFetchedAt).toLocaleString()}` : "never fetched"}{c.lastError ? ` · ${c.lastError}` : ""}</div>
              </div>
              {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-muted hover:text-foreground"><FiExternalLink /></a>}
              <button onClick={async () => { const r = await fetch(`/api/competitors/${c.id}`, { method: "POST" }); const d = await r.json(); r.ok ? toast.success(`${d.fetched ?? 0} posts`) : toast.error(d.error); load(); }} className="p-1.5 text-muted hover:text-foreground" title="Fetch now"><FiRefreshCw /></button>
              <button onClick={() => remove(c)} className="p-1.5 text-muted hover:text-rose-500" title="Remove"><FiTrash2 /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-divider bg-bg-card p-5 space-y-3">
        <h3 className="text-sm font-black text-foreground">Top benchmark posts (last 90 days)</h3>
        {data.top.length === 0 ? (
          <p className="text-xs text-muted">Nothing fetched yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.top.map((p) => (
              <a key={p.id} href={p.url || "#"} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-divider overflow-hidden hover:shadow-md bg-bg-page">
                <div className="aspect-video bg-glass-hover">{p.thumbnailUrl && <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" />}</div>
                <div className="p-2 space-y-1">
                  <div className="text-[10px] font-bold text-muted flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_INFO[p.platform].color }} /> @{p.competitor.handle}</div>
                  <div className="text-[11px] text-foreground line-clamp-2">{p.caption || "(no caption)"}</div>
                  <div className="text-[10px] text-muted">{fmt(p.views)} views · {fmt(p.likes)} likes · {fmt(p.comments)} comments · score {p.score}</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
