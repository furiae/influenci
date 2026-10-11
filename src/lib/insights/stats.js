import { prisma } from "@/lib/prisma";
import { median, quantile } from "./scoring";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localParts(date, tz) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", weekday: "short", hour: "2-digit" });
  const map = {};
  for (const p of fmt.formatToParts(date)) if (p.type !== "literal") map[p.type] = p.value;
  return { weekday: map.weekday, hour: Number(map.hour) };
}

function group(posts, keyFn) {
  const g = {};
  for (const p of posts) {
    const k = keyFn(p);
    if (k == null) continue;
    (g[k] = g[k] || []).push(p);
  }
  return Object.entries(g).map(([key, items]) => ({
    key,
    count: items.length,
    avgScore: avg(items.map((p) => p.score)),
    medianER: median(items.map((p) => p.engagementRate)),
    medianReach: median(items.map((p) => p.reach)),
    avgLikes: avg(items.map((p) => p.likes)),
    avgComments: avg(items.map((p) => p.comments)),
  })).sort((a, b) => (b.medianER ?? 0) - (a.medianER ?? 0));
}

function avg(arr) {
  const a = arr.filter((x) => x != null && Number.isFinite(x));
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
}

/**
 * Deterministic performance facts for one brand actor, used by the dashboard,
 * the narrative summary and the recommender. Pure numbers, no AI.
 */
export async function computeStats(actorId, { days = 365 } = {}) {
  const actor = await prisma.actor.findUnique({ where: { id: actorId }, select: { timezone: true } });
  const tz = actor?.timezone || "America/New_York";
  const since = new Date(Date.now() - days * 86400000);
  const posts = await prisma.channelPost.findMany({
    where: { actorId, postedAt: { gte: since } },
    orderBy: { postedAt: "desc" },
    select: { id: true, platform: true, mediaType: true, format: true, topics: true, hashtags: true, caption: true, postedAt: true, likes: true, comments: true, shares: true, saves: true, views: true, reach: true, engagementRate: true, reachRate: true, score: true, scoreBreakdown: true, thumbnailUrl: true, url: true, analysis: true },
  });
  const channels = await prisma.channel.findMany({ where: { actorId }, select: { id: true, platform: true, handle: true, followers: true, lastSyncedAt: true } });
  const insights = await prisma.channelDailyInsight.findMany({ where: { channel: { actorId }, date: { gte: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10) } }, orderBy: { date: "asc" }, include: { channel: { select: { platform: true } } } });

  const mature = posts.filter((p) => !p.scoreBreakdown?.provisional);
  const now = Date.now();
  const last30 = mature.filter((p) => now - new Date(p.postedAt).getTime() <= 30 * 86400000);
  const prev30 = mature.filter((p) => { const age = now - new Date(p.postedAt).getTime(); return age > 30 * 86400000 && age <= 60 * 86400000; });

  const byPlatform = group(mature, (p) => p.platform);
  const byFormat = group(mature, (p) => p.format || p.mediaType);
  const byMediaType = group(mature, (p) => p.mediaType);
  const byWeekday = group(mature, (p) => (p.postedAt ? localParts(new Date(p.postedAt), tz).weekday : null)).sort((a, b) => WEEKDAYS.indexOf(a.key) - WEEKDAYS.indexOf(b.key));
  const byHour = group(mature, (p) => (p.postedAt ? localParts(new Date(p.postedAt), tz).hour : null)).sort((a, b) => Number(a.key) - Number(b.key));
  const heat = {};
  for (const p of mature) {
    if (!p.postedAt || p.engagementRate == null) continue;
    const { weekday, hour } = localParts(new Date(p.postedAt), tz);
    const k = `${weekday}-${hour}`;
    heat[k] = heat[k] || { weekday, hour, n: 0, sumER: 0, sumScore: 0 };
    heat[k].n += 1;
    heat[k].sumER += p.engagementRate;
    heat[k].sumScore += p.score || 0;
  }
  const heatmap = Object.values(heat).map((h) => ({ weekday: h.weekday, hour: h.hour, n: h.n, avgER: h.sumER / h.n, avgScore: h.sumScore / h.n }));
  const bestSlots = heatmap.filter((h) => h.n >= 2).sort((a, b) => b.avgER - a.avgER).slice(0, 5);

  const tagRows = {};
  for (const p of mature) for (const h of new Set(p.hashtags || [])) {
    tagRows[h] = tagRows[h] || { tag: h, n: 0, ers: [], scores: [] };
    tagRows[h].n += 1;
    if (p.engagementRate != null) tagRows[h].ers.push(p.engagementRate);
    if (p.score != null) tagRows[h].scores.push(p.score);
  }
  const hashtags = Object.values(tagRows).filter((t) => t.n >= 2).map((t) => ({ tag: t.tag, n: t.n, medianER: median(t.ers), avgScore: avg(t.scores) })).sort((a, b) => (b.medianER ?? 0) - (a.medianER ?? 0)).slice(0, 25);

  const topicRows = {};
  for (const p of mature) for (const t of new Set([...(p.topics || []), p.analysis?.activity].filter(Boolean))) {
    const k = String(t).toLowerCase();
    topicRows[k] = topicRows[k] || { topic: k, n: 0, ers: [], scores: [] };
    topicRows[k].n += 1;
    if (p.engagementRate != null) topicRows[k].ers.push(p.engagementRate);
    if (p.score != null) topicRows[k].scores.push(p.score);
  }
  const topics = Object.values(topicRows).map((t) => ({ topic: t.topic, n: t.n, medianER: median(t.ers), avgScore: avg(t.scores) })).sort((a, b) => (b.medianER ?? 0) - (a.medianER ?? 0)).slice(0, 20);

  const captionBuckets = group(mature, (p) => { const n = (p.caption || "").length; return n < 80 ? "short <80" : n < 200 ? "medium 80-200" : n < 500 ? "long 200-500" : "very long 500+"; });
  const ctaRows = group(mature.filter((p) => p.analysis?.ctaType), (p) => p.analysis.ctaType);

  const scoreDistribution = Array.from({ length: 10 }, (_, i) => ({ score: i + 1, n: mature.filter((p) => p.score === i + 1).length }));
  const cadence = {};
  for (const p of mature) {
    if (!p.postedAt) continue;
    const wk = Math.floor(new Date(p.postedAt).getTime() / (7 * 86400000));
    cadence[wk] = (cadence[wk] || 0) + 1;
  }
  const postsPerWeek = Object.keys(cadence).length ? Object.values(cadence).reduce((a, b) => a + b, 0) / Object.keys(cadence).length : 0;

  const kpis = {
    posts: posts.length,
    maturePosts: mature.length,
    followers: Object.fromEntries(channels.map((c) => [c.platform, c.followers])),
    avgScore: avg(mature.map((p) => p.score)),
    medianER: median(mature.map((p) => p.engagementRate)),
    p90ER: quantile(mature.map((p) => p.engagementRate), 0.9),
    medianReach: median(mature.map((p) => p.reach)),
    p90Reach: quantile(mature.map((p) => p.reach), 0.9),
    postsPerWeek,
    last30: { posts: last30.length, avgScore: avg(last30.map((p) => p.score)), medianER: median(last30.map((p) => p.engagementRate)), reach: last30.reduce((s, p) => s + (p.reach || 0), 0) },
    prev30: { posts: prev30.length, avgScore: avg(prev30.map((p) => p.score)), medianER: median(prev30.map((p) => p.engagementRate)), reach: prev30.reduce((s, p) => s + (p.reach || 0), 0) },
  };

  const byFormatPlatform = {};
  for (const p of mature) {
    const k = `${p.platform}:${p.mediaType}`;
    byFormatPlatform[k] = byFormatPlatform[k] || { reach: [], er: [] };
    if (p.reach != null) byFormatPlatform[k].reach.push(p.reach);
    if (p.engagementRate != null) byFormatPlatform[k].er.push(p.engagementRate);
  }
  const baselines = Object.fromEntries(Object.entries(byFormatPlatform).map(([k, v]) => [k, { n: v.er.length, medianReach: median(v.reach), p90Reach: quantile(v.reach, 0.9), medianER: median(v.er), p90ER: quantile(v.er, 0.9) }]));

  const pick = (arr) => arr.map((p) => ({ id: p.id, platform: p.platform, mediaType: p.mediaType, format: p.format, score: p.score, engagementRate: p.engagementRate, reach: p.reach, likes: p.likes, comments: p.comments, shares: p.shares, saves: p.saves, postedAt: p.postedAt, caption: (p.caption || "").slice(0, 200), thumbnailUrl: p.thumbnailUrl, url: p.url, analysis: p.analysis ? { format: p.analysis.format, hook: p.analysis.hook, whyItWorks: p.analysis.whyItWorks, activity: p.analysis.activity, ctaType: p.analysis.ctaType } : null }));
  const sorted = [...mature].filter((p) => p.score != null).sort((a, b) => b.score - a.score || (b.engagementRate ?? 0) - (a.engagementRate ?? 0));

  const followerSeries = insights.map((r) => ({ date: r.date, platform: r.channel.platform, followers: r.followers, newFollowers: r.newFollowers, reach: r.reach, profileViews: r.profileViews, websiteClicks: r.websiteClicks }));

  return {
    computedAt: new Date().toISOString(),
    tz,
    channels,
    kpis,
    byPlatform,
    byFormat,
    byMediaType,
    byWeekday,
    byHour,
    heatmap,
    bestSlots,
    hashtags,
    topics,
    captionBuckets,
    ctaRows,
    scoreDistribution,
    baselines,
    top: pick(sorted.slice(0, 10)),
    bottom: pick(sorted.slice(-10).reverse()),
    recent: pick(posts.slice(0, 12)),
    followerSeries,
  };
}

/** Compact text version for prompts. */
export function statsToPrompt(s) {
  if (!s) return "";
  const pct = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(2)}%`);
  const n = (x) => (x == null ? "n/a" : Math.round(x).toLocaleString());
  const row = (r) => `${r.key}: n=${r.count}, median ER ${pct(r.medianER)}, avg score ${r.avgScore?.toFixed(1) ?? "n/a"}, median reach ${n(r.medianReach)}`;
  const postLine = (p, i) => `${i + 1}. [${p.id}] ${p.platform} ${p.mediaType}${p.format ? ` (${p.format})` : ""} score ${p.score}/10, ER ${pct(p.engagementRate)}, reach ${n(p.reach)}, ${p.likes} likes/${p.comments} comments/${p.shares} shares — "${p.caption.replace(/\s+/g, " ").slice(0, 120)}"${p.analysis?.whyItWorks ? ` · why: ${p.analysis.whyItWorks}` : ""}`;
  return `ACCOUNT PERFORMANCE (last 365 days, ${s.kpis.maturePosts} scored posts; followers ${Object.entries(s.kpis.followers).map(([k, v]) => `${k} ${n(v)}`).join(", ")})
- Median engagement rate ${pct(s.kpis.medianER)} (P90 ${pct(s.kpis.p90ER)}); median reach ${n(s.kpis.medianReach)} (P90 ${n(s.kpis.p90Reach)}); avg score ${s.kpis.avgScore?.toFixed(1) ?? "n/a"}; ${s.kpis.postsPerWeek.toFixed(1)} posts/week
- Last 30 d vs prior 30 d: posts ${s.kpis.last30.posts} vs ${s.kpis.prev30.posts}, median ER ${pct(s.kpis.last30.medianER)} vs ${pct(s.kpis.prev30.medianER)}, avg score ${s.kpis.last30.avgScore?.toFixed(1) ?? "n/a"} vs ${s.kpis.prev30.avgScore?.toFixed(1) ?? "n/a"}
BY PLATFORM
${s.byPlatform.map(row).join("\n") || "(none)"}
BY FORMAT
${s.byFormat.slice(0, 8).map(row).join("\n") || "(none)"}
BY WEEKDAY
${s.byWeekday.map(row).join("\n") || "(none)"}
BEST SLOTS (local time)
${s.bestSlots.map((h) => `${h.weekday} ${h.hour}:00 — avg ER ${pct(h.avgER)} over ${h.n} posts`).join("\n") || "(not enough data)"}
TOPICS
${s.topics.slice(0, 10).map((t) => `${t.topic}: n=${t.n}, median ER ${pct(t.medianER)}, avg score ${t.avgScore?.toFixed(1) ?? "n/a"}`).join("\n") || "(none)"}
HASHTAGS
${s.hashtags.slice(0, 12).map((t) => `#${t.tag}: n=${t.n}, median ER ${pct(t.medianER)}`).join("\n") || "(none)"}
CAPTION LENGTH
${s.captionBuckets.map(row).join("\n") || "(none)"}
CTA TYPE
${s.ctaRows.map(row).join("\n") || "(none)"}
TOP POSTS
${s.top.map(postLine).join("\n") || "(none)"}
WEAKEST POSTS
${s.bottom.map(postLine).join("\n") || "(none)"}`;
}
