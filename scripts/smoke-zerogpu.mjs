// Smoke test for the free community-GPU provider through the real adapter.
// Usage: node --env-file=.env.local scripts/smoke-zerogpu.mjs [modelId]
import zerogpu from "../src/lib/providers/zerogpu.js";

const modelId = process.argv[2] || "zerogpu/ltx-i2v";
const model = zerogpu.models.find((m) => m.id === modelId);
if (!model) throw new Error(`unknown model ${modelId}`);
const t0 = Date.now();
const job = await zerogpu.submit({
  model,
  prompt: "the person smiles and talks to the camera, subtle head movement",
  images: ["https://picsum.photos/seed/influenci/512/768.jpg"],
  settings: { duration: 2, aspect_ratio: "9:16" },
});
console.log("requestId:", job.requestId, "token:", process.env.HF_TOKEN ? "yes" : "no (anonymous quota)");
const result = await job.run();
console.log("video:", result.url, `(${Math.round((Date.now() - t0) / 1000)}s)`);
const head = await fetch(result.url, { method: "HEAD" });
console.log("HEAD", head.status, head.headers.get("content-type"));
