import { PLATFORMS } from "@/lib/platforms";
import { localTimeToUtc } from "@/lib/time";

/** Warm-up defaults per actor per day. 0.5 = every other day. */
export const DEFAULT_CADENCE = {
  window: { start: "09:00", end: "21:00" },
  minSpacingMinutes: 90,
  platforms: {
    tiktok: { perDay: 1 },
    instagram: { perDay: 1 },
    youtube: { perDay: 0.5 },
    facebook: { perDay: 1 },
    pinterest: { perDay: 4 },
    x: { perDay: 2 },
  },
};

export function resolveCadence(actor) {
  const c = actor?.cadence && typeof actor.cadence === "object" ? actor.cadence : {};
  const platforms = {};
  for (const p of PLATFORMS) {
    const perDay = Number(c.platforms?.[p]?.perDay ?? DEFAULT_CADENCE.platforms[p].perDay);
    platforms[p] = { perDay: Number.isFinite(perDay) && perDay >= 0 ? perDay : 0 };
  }
  return {
    window: { ...DEFAULT_CADENCE.window, ...(c.window || {}) },
    minSpacingMinutes: Number(c.minSpacingMinutes ?? DEFAULT_CADENCE.minSpacingMinutes),
    platforms,
  };
}

function dayIndex(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** How many slots a platform gets on this day (handles fractional perDay). */
export function slotsCount(perDay, ymd) {
  if (perDay <= 0) return 0;
  const whole = Math.floor(perDay);
  const frac = perDay - whole;
  if (frac === 0) return whole;
  // e.g. 0.5 -> every other day; 1.5 -> alternate 1 and 2
  const period = Math.round(1 / frac);
  return whole + (dayIndex(ymd) % period === 0 ? 1 : 0);
}

/**
 * Evenly spaced UTC times inside the posting window for `count` slots,
 * offset per platform so different platforms don't fire at the same minute.
 */
export function slotTimes({ ymd, tz, window, count, platformIndex = 0 }) {
  if (count <= 0) return [];
  const start = localTimeToUtc(ymd, window.start, tz).getTime();
  const end = localTimeToUtc(ymd, window.end, tz).getTime();
  const span = Math.max(end - start, 60 * 60 * 1000);
  const step = span / count;
  const offset = ((platformIndex % 6) * 7 + 3) * 60 * 1000; // stagger platforms by a few minutes
  return Array.from({ length: count }, (_, i) => new Date(start + Math.round(step * i + step / 2 + offset) % span + 0));
}

/** All target slots for an actor on a day: [{ platform, slotIndex, scheduledAt }]. */
export function slotsForDay(actor, ymd) {
  const cadence = resolveCadence(actor);
  const out = [];
  PLATFORMS.forEach((platform, platformIndex) => {
    const count = slotsCount(cadence.platforms[platform].perDay, ymd);
    const times = slotTimes({ ymd, tz: actor.timezone || "America/New_York", window: cadence.window, count, platformIndex });
    times.forEach((scheduledAt, slotIndex) => out.push({ platform, slotIndex, scheduledAt }));
  });
  return out.sort((a, b) => a.scheduledAt - b.scheduledAt);
}
