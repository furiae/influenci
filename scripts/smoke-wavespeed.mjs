// Smoke test for the Wavespeed provider through the real adapter.
// Usage: node --env-file=.env.local scripts/smoke-wavespeed.mjs [modelId]
// Costs real credit at Wavespeed (about $0.15 for a 5 s 480p clip).
import wavespeed from "../src/lib/providers/wavespeed.js";

const modelId = process.argv[2] || "wavespeed/wan-2.2-i2v-480p";
const model = wavespeed.models.find((m) => m.id === modelId);
if (!model) throw new Error(`unknown model ${modelId}`);
const apiKey = process.env.WAVESPEED_API_KEY;
if (!apiKey) throw new Error("WAVESPEED_API_KEY missing");

const t0 = Date.now();
const job = await wavespeed.submit({
  model,
  prompt: "the person smiles and talks to the camera with subtle natural head movement, soft daylight",
  images: ["https://picsum.photos/seed/influenci/512/768.jpg"],
  settings: { duration: 5, aspect_ratio: "9:16", resolution: "480p" },
  apiKey,
});
console.log("submitted requestId:", job.requestId);
for (;;) {
  const s = await wavespeed.status({ requestId: job.requestId, apiKey });
  if (s.status === "completed") {
    console.log("video:", s.url, `(${Math.round((Date.now() - t0) / 1000)}s)`);
    const head = await fetch(s.url, { method: "HEAD" });
    console.log("HEAD", head.status, head.headers.get("content-type"), head.headers.get("content-length"), "bytes");
    break;
  }
  if (s.status === "failed") { console.log("FAILED:", s.error); process.exit(1); }
  await new Promise((r) => setTimeout(r, 3000));
}
