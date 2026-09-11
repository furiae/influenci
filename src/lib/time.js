/** Timezone helpers without dependencies (Intl only). */

function parts(date, tz) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map = {};
  for (const p of fmt.formatToParts(date)) if (p.type !== "literal") map[p.type] = Number(p.value);
  return map;
}

/** Offset (ms) of `tz` from UTC at the given instant. */
export function tzOffsetMs(date, tz) {
  const p = parts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "YYYY-MM-DD" for the instant in `tz`. */
export function ymdIn(date, tz) {
  const p = parts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function todayIn(tz) {
  return ymdIn(new Date(), tz);
}

/** Add days to a "YYYY-MM-DD" string. */
export function addDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** Convert a local wall-clock time ("HH:mm") on `ymd` in `tz` to a UTC Date. */
export function localTimeToUtc(ymd, hhmm, tz) {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  // First guess: treat wall time as UTC, then correct by the zone offset (twice to settle DST edges).
  let guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  for (let i = 0; i < 2; i++) {
    const off = tzOffsetMs(guess, tz);
    guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0) - off);
  }
  return guess;
}

/** [startUtc, endUtc) of the local day `ymd` in `tz`. */
export function localDayBounds(ymd, tz) {
  return [localTimeToUtc(ymd, "00:00", tz), localTimeToUtc(addDays(ymd, 1), "00:00", tz)];
}

export function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
