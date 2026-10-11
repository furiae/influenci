/**
 * 1-10 success score for our own posts. Pure functions, unit-tested.
 *
 * score = 50% relative (percentile of engagement rate inside this channel)
 *       + 30% absolute (engagement rate against industry bands)
 *       + 20% reach    (reach / followers decile; falls back to views)
 * Posts younger than PROVISIONAL_HOURS are scored but flagged provisional and
 * excluded from the percentile pool so they don't drag the baseline.
 */

export const SCORE_VERSION = 1;
export const PROVISIONAL_HOURS = 72;

/** Weighted interactions: comments, shares and saves signal more than likes. */
export function interactions(p) {
  return (p.likes || 0) + 2 * (p.comments || 0) + 3 * (p.shares || 0) + 3 * (p.saves || 0);
}

/** Engagement rate on reach when known, else on followers. Returns null when neither is known. */
export function engagementRate(p, followers) {
  const denom = p.reach || p.followersAtFetch || followers || 0;
  if (!denom) return null;
  return interactions(p) / denom;
}

export function reachRate(p, followers) {
  const f = p.followersAtFetch || followers || 0;
  if (!f) return null;
  if (p.reach) return p.reach / f;
  if (p.views) return p.views / f;
  return null;
}

/** Industry bands for organic engagement rate → 1..10. */
const BANDS = {
  instagram: [0.002, 0.005, 0.01, 0.015, 0.02, 0.03, 0.04, 0.06, 0.09],
  facebook: [0.0005, 0.001, 0.002, 0.004, 0.006, 0.01, 0.015, 0.025, 0.04],
  // Private group, denominator = members. Opted-in audience, so the bands sit well above the Page's.
  facebook_group: [0.002, 0.004, 0.007, 0.012, 0.02, 0.03, 0.045, 0.07, 0.1],
};

export function absoluteBand(platform, er) {
  if (er == null) return null;
  const bands = BANDS[platform] || BANDS.instagram;
  let s = 1;
  for (const b of bands) if (er >= b) s += 1;
  return s;
}

/** Percentile (0..1) of value within sorted ascending pool. */
export function percentile(sortedPool, value) {
  if (!sortedPool.length) return null;
  let below = 0;
  let equal = 0;
  for (const v of sortedPool) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  return (below + equal * 0.5) / sortedPool.length;
}

export function decile(pct) {
  if (pct == null) return null;
  return Math.max(1, Math.min(10, Math.ceil(pct * 10) || 1));
}

export function isProvisional(postedAt, now = Date.now()) {
  if (!postedAt) return false;
  return now - new Date(postedAt).getTime() < PROVISIONAL_HOURS * 3600 * 1000;
}

/**
 * Score one post against its channel's pool.
 * @param {object} p             post with likes/comments/shares/saves/views/reach/followersAtFetch/postedAt/platform
 * @param {object} ctx           { followers, erPool: number[] (ascending), reachPool: number[] (ascending), now }
 * @returns {{ score:number|null, breakdown:object, engagementRate:number|null, reachRate:number|null }}
 */
export function scoreChannelPost(p, { followers = 0, erPool = [], reachPool = [], now = Date.now() } = {}) {
  const er = engagementRate(p, followers);
  const rr = reachRate(p, followers);
  const provisional = isProvisional(p.postedAt, now);
  const relative = er == null ? null : decile(percentile(erPool, er));
  const absolute = absoluteBand(p.platform, er);
  const reach = rr == null ? null : decile(percentile(reachPool, rr));

  const parts = [];
  if (relative != null) parts.push([relative, 0.5]);
  if (absolute != null) parts.push([absolute, 0.3]);
  if (reach != null) parts.push([reach, 0.2]);
  let score = null;
  if (parts.length) {
    const wsum = parts.reduce((a, [, w]) => a + w, 0);
    score = Math.round(parts.reduce((a, [v, w]) => a + v * w, 0) / wsum);
    score = Math.max(1, Math.min(10, score));
  }
  return {
    score,
    engagementRate: er,
    reachRate: rr,
    breakdown: { version: SCORE_VERSION, relative, absolute, reach, provisional, interactions: interactions(p), denominator: p.reach || p.followersAtFetch || followers || null },
  };
}

/** Build ascending pools from mature posts of one channel. */
export function buildPools(posts, followers, now = Date.now()) {
  const erPool = [];
  const reachPool = [];
  for (const p of posts) {
    if (isProvisional(p.postedAt, now)) continue;
    const er = engagementRate(p, followers);
    const rr = reachRate(p, followers);
    if (er != null) erPool.push(er);
    if (rr != null) reachPool.push(rr);
  }
  erPool.sort((a, b) => a - b);
  reachPool.sort((a, b) => a - b);
  return { erPool, reachPool };
}

/** Median of a numeric array (null when empty). */
export function median(arr) {
  const a = arr.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export function quantile(arr, q) {
  const a = arr.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}
