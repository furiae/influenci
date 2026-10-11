"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { FiLoader, FiRefreshCw } from "react-icons/fi";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Section, fmt, pct, btnGhost } from "@/components/ui/form";
import { PostCard, PostDrawer } from "./PostsTab";
import { DoInClaude } from "@/components/ui/ai-hint";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const C = { primary: "var(--primary)", muted: "var(--secondary-text)", grid: "var(--divider)", ig: "#E1306C", fb: "#1877F2" };

export function Kpi({ label, value, sub, delta }) {
  return (
    <div className="rounded-xl border border-divider bg-bg-card p-4">
      <div className="text-[10px] uppercase font-bold text-muted tracking-wider">{label}</div>
      <div className="text-2xl font-black text-foreground mt-1">{value}</div>
      {(sub || delta != null) && <div className="text-[11px] text-muted mt-0.5">{delta != null && <span className={delta >= 0 ? "text-emerald-600 font-bold" : "text-rose-500 font-bold"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% </span>}{sub}</div>}
    </div>
  );
}

export function Heatmap({ cells }) {
  const map = Object.fromEntries(cells.map((c) => [`${c.weekday}-${c.hour}`, c]));
  const max = Math.max(...cells.map((c) => c.avgER), 0.0001);
  const hours = Array.from({ length: 16 }, (_, i) => i + 6);
  return (
    <div className="overflow-x-auto">
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `36px repeat(${hours.length}, minmax(18px, 1fr))` }}>
        <div />
        {hours.map((h) => <div key={h} className="text-[9px] text-muted text-center">{h}</div>)}
        {WEEKDAYS.map((d) => (
          <Fragment key={d}>
            <div className="text-[10px] font-bold text-muted">{d}</div>
            {hours.map((h) => {
              const c = map[`${d}-${h}`];
              const v = c ? c.avgER / max : 0;
              return <div key={`${d}-${h}`} title={c ? `${d} ${h}:00 · ${c.n} posts · ER ${(c.avgER * 100).toFixed(2)}%` : `${d} ${h}:00 · no posts`} className="h-5 rounded-sm" style={{ background: c ? `color-mix(in srgb, var(--primary) ${Math.round(20 + v * 80)}%, transparent)` : "var(--glass-hover)" }} />;
            })}
          </Fragment>
        ))}
      </div>
      <p className="text-[10px] text-muted mt-1">Darker = higher average engagement rate of posts published at that local day/hour.</p>
    </div>
  );
}

const delta = (a, b) => (a != null && b ? ((a - b) / b) * 100 : null);

export default function OverviewTab({ actor, reload }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const load = () => fetch(`/api/accounts/${actor.id}/stats`).then((r) => (r.ok ? r.json() : null)).then(setData);
  useEffect(() => { load(); }, [actor.id, actor.lastImportAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const summarize = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/accounts/${actor.id}/stats`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "summarize" }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success("Summary refreshed");
      await load();
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="py-16 flex justify-center"><FiLoader className="animate-spin text-primary" /></div>;
  const s = data.stats;
  const n = data.summary?.narrative;
  if (!s.kpis.posts) {
    return <Section title="Nothing imported yet" hint="Connect the brand's Facebook Page and Instagram in the Channels tab, then import their history."><Link href={`/accounts/${actor.id}?tab=channels`} className="text-primary font-bold text-xs">Go to Channels →</Link></Section>;
  }

  const followerSeries = s.followerSeries.filter((r) => r.followers != null || r.reach != null);
  const byDate = {};
  for (const r of followerSeries) { byDate[r.date] = byDate[r.date] || { date: r.date }; byDate[r.date][`${r.platform}Reach`] = r.reach; byDate[r.date][`${r.platform}Followers`] = r.followers; }
  const reachSeries = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  const formatRows = s.byFormat.slice(0, 8).map((r) => ({ name: r.key, er: r.medianER != null ? +(r.medianER * 100).toFixed(2) : 0, n: r.count }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Followers" value={Object.values(s.kpis.followers).filter(Boolean).map(fmt).join(" + ") || "–"} sub={Object.keys(s.kpis.followers).join(" + ")} />
        <Kpi label="Avg score" value={s.kpis.avgScore != null ? s.kpis.avgScore.toFixed(1) : "–"} sub="of 10, all scored posts" delta={delta(s.kpis.last30.avgScore, s.kpis.prev30.avgScore)} />
        <Kpi label="Median ER" value={pct(s.kpis.medianER, 2)} sub={`P90 ${pct(s.kpis.p90ER, 2)}`} delta={delta(s.kpis.last30.medianER, s.kpis.prev30.medianER)} />
        <Kpi label="30-day reach" value={fmt(s.kpis.last30.reach)} sub={`${s.kpis.last30.posts} posts in 30 d`} delta={delta(s.kpis.last30.reach, s.kpis.prev30.reach)} />
        <Kpi label="Posts / week" value={s.kpis.postsPerWeek.toFixed(1)} sub={`${s.kpis.posts} posts imported`} />
      </div>

      <Section title={n?.headline || "Performance summary"} hint={data.summary?.computedAt ? `Claude's read of the numbers · ${new Date(data.summary.computedAt).toLocaleString()}` : "Run the summary to get Claude's read of the numbers"} right={<button onClick={summarize} disabled={busy} className={btnGhost}>{busy ? <FiLoader className="animate-spin" /> : <FiRefreshCw />} {n ? "Refresh" : "Summarise"}</button>}>
        <DoInClaude prompt="weekly-review" brandId={actor.id} what="Claude's read of the numbers is saved here" />
        {n ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-foreground">
            <div><div className="font-black text-emerald-600 mb-1">What&apos;s working</div><ul className="list-disc ml-4 space-y-1">{n.working.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            <div><div className="font-black text-rose-500 mb-1">What isn&apos;t</div><ul className="list-disc ml-4 space-y-1">{n.notWorking.map((x, i) => <li key={i}>{x}</li>)}</ul>{n.bestTimes && <p className="mt-2"><strong>Best times:</strong> {n.bestTimes}</p>}</div>
            <div><div className="font-black text-primary mb-1">Do next</div><ol className="list-decimal ml-4 space-y-1">{n.actions.map((a, i) => <li key={i}><strong>{a.action}</strong> — {a.why} <span className="text-muted">({a.expectedImpact})</span></li>)}</ol></div>
          </div>
        ) : <p className="text-xs text-muted">Needs at least 3 scored posts and an Anthropic key.</p>}
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Daily reach (last 90 days)">
          {reachSeries.length > 1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={reachSeries}><CartesianGrid stroke={C.grid} strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 10, fill: C.muted }} tickFormatter={(d) => d.slice(5)} /><YAxis tick={{ fontSize: 10, fill: C.muted }} tickFormatter={fmt} width={40} /><Tooltip contentStyle={{ fontSize: 11 }} /><Line type="monotone" dataKey="instagramReach" name="Instagram" stroke={C.ig} dot={false} strokeWidth={2} /><Line type="monotone" dataKey="facebookReach" name="Facebook" stroke={C.fb} dot={false} strokeWidth={2} /></LineChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-muted">Account insights arrive with the import (Meta keeps about 90 days of daily reach).</p>}
        </Section>
        <Section title="Median engagement rate by format">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={formatRows}><CartesianGrid stroke={C.grid} strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 10, fill: C.muted }} /><YAxis tick={{ fontSize: 10, fill: C.muted }} unit="%" width={40} /><Tooltip contentStyle={{ fontSize: 11 }} formatter={(v, k, p) => [`${v}% (${p.payload.n} posts)`, "median ER"]} /><Bar dataKey="er" fill={C.primary} radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </Section>
        <Section title="Score distribution">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={s.scoreDistribution}><XAxis dataKey="score" tick={{ fontSize: 10, fill: C.muted }} /><YAxis tick={{ fontSize: 10, fill: C.muted }} width={30} allowDecimals={false} /><Tooltip contentStyle={{ fontSize: 11 }} /><Bar dataKey="n" name="posts" fill={C.primary} radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </Section>
        <Section title="Best time to post" hint="From this account's own posts, in its timezone.">
          <Heatmap cells={s.heatmap} />
        </Section>
      </div>

      <Section title="Top posts" hint="Highest success scores. Click one for the full breakdown and to make a post like it.">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{s.top.slice(0, 10).map((p) => <PostCard key={p.id} p={p} onOpen={setOpen} />)}</div>
      </Section>
      {open && <PostDrawer actorId={actor.id} post={open} onClose={() => setOpen(null)} onLike={async (p) => { const res = await fetch(`/api/accounts/${actor.id}/recommendations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelPostId: p.id }) }); const d = await res.json(); res.ok ? toast.success("Recommendation created. See the Recommend tab.") : toast.error(d.error || "Failed"); setOpen(null); }} />}
    </div>
  );
}
