"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { FiLoader, FiPrinter, FiArrowLeft } from "react-icons/fi";
import { fmt, pct, when, ScoreBadge } from "@/components/ui/form";
import { Kpi, Heatmap } from "@/components/accounts/OverviewTab";

/** Printable monthly report: KPIs, Claude narrative, best/worst posts, breakdowns. */
export default function ReportPage() {
  const { id } = useParams();
  const [actor, setActor] = useState(null);
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  useEffect(() => { fetch(`/api/accounts/${id}`).then((r) => (r.ok ? r.json() : null)).then(setActor); }, [id]);
  useEffect(() => { fetch(`/api/accounts/${id}/stats?days=${Math.max(days, 90)}`).then((r) => (r.ok ? r.json() : null)).then(setData); }, [id, days]);
  if (!actor || !data) return <div className="h-full flex items-center justify-center"><FiLoader className="animate-spin text-primary text-2xl" /></div>;
  const s = data.stats;
  const n = data.summary?.narrative;
  const cutoff = new Date(s.computedAt).getTime() - days * 86400000;
  const inRange = (p) => new Date(p.postedAt).getTime() >= cutoff;
  const top = s.top.filter(inRange).slice(0, 6);
  const bottom = s.bottom.filter(inRange).slice(0, 4);
  const rowsTable = (title, rows) => (
    <div className="break-inside-avoid">
      <h3 className="text-sm font-black text-foreground mb-1">{title}</h3>
      <table className="w-full text-xs"><thead><tr className="text-[10px] uppercase text-muted text-left"><th className="py-1">Key</th><th>Posts</th><th>Median ER</th><th>Avg score</th><th>Median reach</th></tr></thead>
        <tbody className="divide-y divide-divider">{rows.slice(0, 8).map((r) => <tr key={r.key}><td className="py-1 text-foreground">{r.key}</td><td>{r.count}</td><td>{pct(r.medianER, 2)}</td><td>{r.avgScore?.toFixed(1) ?? "–"}</td><td>{fmt(r.medianReach)}</td></tr>)}</tbody></table>
    </div>
  );
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 print:p-0">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <Link href={`/accounts/${id}`} className="text-xs font-bold text-muted flex items-center gap-1"><FiArrowLeft /> Back</Link>
          <div className="flex items-center gap-2">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm">{[30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select>
            <button onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold flex items-center gap-2"><FiPrinter /> Print / save PDF</button>
          </div>
        </div>
        <header className="flex items-center gap-4">
          {actor.imageUrl && <img src={actor.imageUrl} alt="" className="w-14 h-14 rounded-xl object-cover border border-divider" />}
          <div><h1 className="text-2xl font-black text-foreground">{actor.name} · social performance report</h1><p className="text-xs text-muted">Last {days} days · generated {new Date().toLocaleDateString()} · {actor.channels.map((c) => `@${c.handle} (${fmt(c.followers)})`).join(" · ")}</p></div>
        </header>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Posts (30 d)" value={s.kpis.last30.posts} sub={`vs ${s.kpis.prev30.posts} prior`} />
          <Kpi label="Avg score (30 d)" value={s.kpis.last30.avgScore?.toFixed(1) ?? "–"} sub={`vs ${s.kpis.prev30.avgScore?.toFixed(1) ?? "–"} prior`} />
          <Kpi label="Median ER (30 d)" value={pct(s.kpis.last30.medianER, 2)} sub={`vs ${pct(s.kpis.prev30.medianER, 2)} prior`} />
          <Kpi label="Reach (30 d)" value={fmt(s.kpis.last30.reach)} sub={`vs ${fmt(s.kpis.prev30.reach)} prior`} />
        </div>
        {n && (
          <section className="rounded-xl border border-divider p-5 space-y-3 break-inside-avoid">
            <h2 className="text-base font-black text-foreground">{n.headline}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-foreground">
              <div><div className="font-black text-emerald-600 mb-1">Working</div><ul className="list-disc ml-4 space-y-1">{n.working.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
              <div><div className="font-black text-rose-500 mb-1">Not working</div><ul className="list-disc ml-4 space-y-1">{n.notWorking.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
              <div><div className="font-black text-primary mb-1">Next actions</div><ol className="list-decimal ml-4 space-y-1">{n.actions.map((a, i) => <li key={i}><strong>{a.action}</strong> — {a.why}</li>)}</ol></div>
            </div>
            <p className="text-xs text-muted"><strong>Audience:</strong> {n.audienceNotes} <strong>Best times:</strong> {n.bestTimes}</p>
          </section>
        )}
        <section className="space-y-2 break-inside-avoid">
          <h2 className="text-sm font-black text-foreground">Top posts</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">{top.map((p) => <div key={p.id} className="rounded-lg border border-divider overflow-hidden"><div className="aspect-square bg-glass-hover relative">{p.thumbnailUrl && <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" />}<div className="absolute top-1 left-1"><ScoreBadge score={p.score} /></div></div><div className="p-1.5 text-[10px] text-muted">{when(p.postedAt)} · {pct(p.engagementRate)} · {fmt(p.reach)} reach</div></div>)}</div>
          {bottom.length > 0 && <><h2 className="text-sm font-black text-foreground pt-2">Weakest posts</h2><div className="grid grid-cols-4 md:grid-cols-8 gap-2">{bottom.map((p) => <div key={p.id} className="rounded-lg border border-divider overflow-hidden"><div className="aspect-square bg-glass-hover relative">{p.thumbnailUrl && <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" />}<div className="absolute top-1 left-1"><ScoreBadge score={p.score} /></div></div></div>)}</div></>}
        </section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{rowsTable("By platform", s.byPlatform)}{rowsTable("By format", s.byFormat)}{rowsTable("By weekday", s.byWeekday)}{rowsTable("Caption length", s.captionBuckets)}</div>
        <section className="break-inside-avoid"><h3 className="text-sm font-black text-foreground mb-2">Best time to post</h3><Heatmap cells={s.heatmap} /></section>
        <p className="text-[10px] text-muted">Score: 50% rank within this account, 30% industry engagement bands, 20% reach rate. ER = (likes + 2·comments + 3·shares + 3·saves) ÷ reach (or followers when reach is unknown).</p>
      </div>
    </div>
  );
}
