"use client";

import { useEffect, useState } from "react";
import { FiLoader } from "react-icons/fi";
import { Section, fmt, pct } from "@/components/ui/form";

function Table({ title, rows, cols }) {
  return (
    <Section title={title}>
      {rows.length === 0 ? <p className="text-xs text-muted">Not enough data.</p> : (
        <table className="w-full text-xs">
          <thead><tr className="text-[10px] uppercase text-muted text-left">{cols.map((c) => <th key={c.key} className="py-1 pr-2 font-bold">{c.label}</th>)}</tr></thead>
          <tbody className="divide-y divide-divider">{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c.key} className="py-1.5 pr-2 text-foreground">{c.render ? c.render(r) : r[c.key]}</td>)}</tr>)}</tbody>
        </table>
      )}
    </Section>
  );
}

const perf = [
  { key: "count", label: "Posts" },
  { key: "medianER", label: "Median ER", render: (r) => pct(r.medianER, 2) },
  { key: "avgScore", label: "Avg score", render: (r) => (r.avgScore != null ? r.avgScore.toFixed(1) : "–") },
  { key: "medianReach", label: "Median reach", render: (r) => fmt(r.medianReach) },
  { key: "avgLikes", label: "Avg likes", render: (r) => fmt(r.avgLikes) },
  { key: "avgComments", label: "Avg comments", render: (r) => fmt(r.avgComments) },
];

export default function InsightsTab({ actor }) {
  const [data, setData] = useState(null);
  useEffect(() => { fetch(`/api/accounts/${actor.id}/stats`).then((r) => (r.ok ? r.json() : null)).then(setData); }, [actor.id]);
  if (!data) return <div className="py-16 flex justify-center"><FiLoader className="animate-spin text-primary" /></div>;
  const s = data.stats;
  const keyCol = (label) => ({ key: "key", label });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Table title="By platform" rows={s.byPlatform} cols={[keyCol("Platform"), ...perf]} />
        <Table title="By format" rows={s.byFormat} cols={[keyCol("Format"), ...perf]} />
        <Table title="By weekday" rows={s.byWeekday} cols={[keyCol("Day"), ...perf]} />
        <Table title="By hour (local)" rows={s.byHour} cols={[{ key: "key", label: "Hour", render: (r) => `${r.key}:00` }, ...perf]} />
        <Table title="Topics & species" rows={s.topics} cols={[{ key: "topic", label: "Topic" }, { key: "n", label: "Posts" }, { key: "medianER", label: "Median ER", render: (r) => pct(r.medianER, 2) }, { key: "avgScore", label: "Avg score", render: (r) => (r.avgScore != null ? r.avgScore.toFixed(1) : "–") }]} />
        <Table title="Hashtags (used ≥ 2×)" rows={s.hashtags} cols={[{ key: "tag", label: "Hashtag", render: (r) => `#${r.tag}` }, { key: "n", label: "Posts" }, { key: "medianER", label: "Median ER", render: (r) => pct(r.medianER, 2) }, { key: "avgScore", label: "Avg score", render: (r) => (r.avgScore != null ? r.avgScore.toFixed(1) : "–") }]} />
        <Table title="Caption length" rows={s.captionBuckets} cols={[keyCol("Length"), ...perf]} />
        <Table title="Call-to-action type (analysed posts)" rows={s.ctaRows} cols={[keyCol("CTA"), ...perf]} />
      </div>
      <Section title="Prediction accuracy" hint="How close recommended posts' predicted scores were to what they actually scored after publishing.">
        {data.summary?.calibration ? <p className="text-xs text-foreground">{data.summary.calibration.n} published recommendations · mean absolute error {data.summary.calibration.mae} points · bias {data.summary.calibration.bias > 0 ? "+" : ""}{data.summary.calibration.bias} (positive = predictions ran high). The recommender is told this and corrects for it.</p> : <p className="text-xs text-muted">No recommended posts have matured yet.</p>}
      </Section>
    </div>
  );
}
