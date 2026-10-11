// node --env-file=.env.local scripts/seed-apex.mjs [https://app.influenci.ai]
// Seeds the Apex Outdoor Rewards brand (owner account) from the transcribed
// screenshots by calling the ops route with OPS_SECRET.
const base = (process.argv[2] || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.OPS_SECRET;
if (!secret) {
  console.error("OPS_SECRET is not set");
  process.exit(1);
}
const res = await fetch(`${base}/api/ops/seed-apex`, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: "{}" });
const body = await res.json().catch(() => ({}));
console.log(res.status, body);
process.exit(res.ok ? 0 : 1);
