import { describe, it, expect } from "vitest";
import { scoreChannelPost, buildPools, engagementRate, absoluteBand, percentile, decile, isProvisional, median, quantile } from "../src/lib/insights/scoring.js";

const day = 86400000;
const now = Date.UTC(2026, 9, 11);
const mk = (i, over = {}) => ({ platform: "instagram", likes: 100 + i * 10, comments: 5 + i, shares: i, saves: i, views: 0, reach: 2000 + i * 100, followersAtFetch: 10000, postedAt: new Date(now - (i + 10) * day), ...over });

describe("engagement rate", () => {
  it("uses reach when known, followers otherwise", () => {
    expect(engagementRate({ likes: 100, comments: 10, shares: 0, saves: 0, reach: 2000 }, 10000)).toBeCloseTo(120 / 2000);
    expect(engagementRate({ likes: 100, comments: 10, shares: 0, saves: 0 }, 10000)).toBeCloseTo(120 / 10000);
    expect(engagementRate({ likes: 1 }, 0)).toBeNull();
  });
});

describe("bands and percentiles", () => {
  it("maps ER to 1..10", () => {
    expect(absoluteBand("instagram", 0)).toBe(1);
    expect(absoluteBand("instagram", 0.02)).toBe(6);
    expect(absoluteBand("instagram", 1)).toBe(10);
    expect(absoluteBand("facebook", 0.004)).toBe(5);
  });
  it("percentile → decile", () => {
    const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(decile(percentile(pool, 10))).toBe(10);
    expect(decile(percentile(pool, 1))).toBe(1);
    expect(decile(percentile(pool, 5))).toBe(5);
    expect(percentile([], 1)).toBeNull();
  });
});

describe("scoreChannelPost", () => {
  const posts = Array.from({ length: 20 }, (_, i) => mk(i));
  const pools = buildPools(posts, 10000, now);
  it("scores the best post high and the worst low, always within 1..10", () => {
    const best = scoreChannelPost(posts[19], { followers: 10000, ...pools, now });
    const worst = scoreChannelPost(posts[0], { followers: 10000, ...pools, now });
    expect(best.score).toBeGreaterThan(worst.score);
    for (const p of posts) {
      const s = scoreChannelPost(p, { followers: 10000, ...pools, now }).score;
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(10);
    }
  });
  it("flags young posts provisional and keeps them out of the pool", () => {
    const young = mk(50, { postedAt: new Date(now - day) });
    expect(isProvisional(young.postedAt, now)).toBe(true);
    const withYoung = buildPools([...posts, young], 10000, now);
    expect(withYoung.erPool.length).toBe(pools.erPool.length);
    expect(scoreChannelPost(young, { followers: 10000, ...pools, now }).breakdown.provisional).toBe(true);
  });
  it("re-weights when reach is unknown", () => {
    const r = scoreChannelPost({ ...mk(5), reach: null, views: 0 }, { followers: 10000, ...pools, now });
    expect(r.breakdown.reach).toBeNull();
    expect(r.score).toBeGreaterThanOrEqual(1);
  });
  it("returns null when nothing can be computed", () => {
    expect(scoreChannelPost({ platform: "instagram", likes: 0 }, { followers: 0, erPool: [], reachPool: [], now }).score).toBeNull();
  });
});

describe("median / quantile", () => {
  it("handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(quantile([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6);
  });
});

describe("facebook_group bands", () => {
  it("expects far more engagement per member than the Page gets per follower", () => {
    expect(absoluteBand("facebook_group", 0.003)).toBeLessThan(absoluteBand("facebook", 0.003));
    expect(absoluteBand("facebook_group", 0.1)).toBe(10);
    expect(absoluteBand("facebook_group", 0.001)).toBe(1);
  });
});
