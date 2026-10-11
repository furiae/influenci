/**
 * Outdoor-industry calendar: moments a hunting / fishing brand can ride.
 * Dates are approximate US-wide windows ("MM-DD"); brandProfile.seasonality adds more.
 */
export const OUTDOOR_SEASONS = [
  { name: "Ice-out & early spring fishing", from: "03-15", to: "04-30", tags: ["fishing", "bass", "crappie", "walleye"], note: "Pre-spawn bass, walleye openers, crappie" },
  { name: "Spring turkey season", from: "03-20", to: "05-31", tags: ["turkey", "hunting"], note: "Youth weekends early April; peak gobbling mid-April; most states close late May" },
  { name: "Bass spawn", from: "04-01", to: "06-15", tags: ["fishing", "bass"], note: "Sight fishing, bed fishing debates, big-fish photos" },
  { name: "Memorial Day weekend", from: "05-23", to: "05-27", tags: ["fishing", "family", "holiday"] },
  { name: "Father's Day", from: "06-10", to: "06-16", tags: ["gift", "family", "gear"] },
  { name: "Summer fishing / topwater", from: "06-15", to: "08-31", tags: ["fishing", "bass", "catfish", "kids"], note: "Family trips, topwater bites, night fishing" },
  { name: "Scouting & trail cams", from: "07-15", to: "09-15", tags: ["whitetail", "hunting", "scouting"], note: "Velvet bucks, trail-cam pics, food plots, bow practice" },
  { name: "Dove opener", from: "08-28", to: "09-10", tags: ["dove", "hunting", "opener"] },
  { name: "Early archery / velvet", from: "09-01", to: "09-30", tags: ["whitetail", "archery"], note: "Opening weekend content, first bucks of the year" },
  { name: "Waterfowl early seasons", from: "09-15", to: "10-31", tags: ["waterfowl", "duck", "goose"] },
  { name: "October lull → pre-rut", from: "10-01", to: "10-25", tags: ["whitetail", "hunting"], note: "Cold-front hunts, acorns, scrapes appearing" },
  { name: "Whitetail rut", from: "10-25", to: "11-20", tags: ["whitetail", "rut", "hunting"], note: "Peak engagement window for deer content; big-buck photos, rut-cation jokes" },
  { name: "Gun season openers", from: "11-10", to: "11-30", tags: ["whitetail", "hunting", "opener"], note: "Most Midwest/East firearm openers; camp traditions" },
  { name: "Thanksgiving week", from: "11-22", to: "11-30", tags: ["holiday", "family", "hunting"] },
  { name: "Holiday gifting / Black Friday", from: "11-20", to: "12-24", tags: ["gift", "gear", "sale"] },
  { name: "Late season & muzzleloader", from: "12-01", to: "01-15", tags: ["whitetail", "hunting", "late-season"], note: "Cold-weather hunts, management bucks, freezer-filling does" },
  { name: "Ice fishing", from: "12-15", to: "02-28", tags: ["fishing", "ice"], note: "Northern audiences; hard-water content" },
  { name: "Shed hunting & recap", from: "01-15", to: "03-15", tags: ["whitetail", "sheds", "recap"], note: "Season recaps, shed finds, planning next year, taxidermy" },
  { name: "Turkey prep", from: "02-15", to: "03-20", tags: ["turkey", "calling", "gear"], note: "Calling practice, pattern your shotgun, new gear" },
];

function mmdd(d) {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inWindow(md, from, to) {
  return from <= to ? md >= from && md <= to : md >= from || md <= to; // wraps year end
}

/** Seasons active between `start` and `start + days` (dates local). */
export function upcomingSeasons({ start = new Date(), days = 30, extra = [] } = {}) {
  const all = [...OUTDOOR_SEASONS, ...(Array.isArray(extra) ? extra.filter((s) => s?.from && s?.to) : [])];
  const seen = new Set();
  const out = [];
  for (let i = 0; i <= days; i += 1) {
    const d = new Date(start.getTime() + i * 86400000);
    const md = mmdd(d);
    for (const s of all) {
      if (seen.has(s.name)) continue;
      if (inWindow(md, s.from, s.to)) {
        seen.add(s.name);
        out.push({ ...s, startsInDays: i });
      }
    }
  }
  return out;
}

export function seasonsToPrompt(seasons) {
  if (!seasons?.length) return "";
  return `SEASONAL MOMENTS IN THE NEXT 30 DAYS\n${seasons.map((s) => `- ${s.name} (${s.from} → ${s.to}${s.startsInDays ? `, starts in ${s.startsInDays} d` : ", active now"})${s.note ? `: ${s.note}` : ""}`).join("\n")}`;
}
