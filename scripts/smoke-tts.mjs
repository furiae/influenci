// Smoke test for the free voiceover path: edge-tts -> Vercel Blob.
// Usage: node --env-file=.env.local scripts/smoke-tts.mjs
import { synthesizeToBlob, estimateSpeechSeconds } from "../src/lib/tts.js";

const script = process.argv.slice(2).join(" ") || "Hey! I just tried this new serum for a week and honestly my skin has never looked this good. Link in bio.";
console.log("estimated seconds:", estimateSpeechSeconds(script));
const t0 = Date.now();
const url = await synthesizeToBlob(script, "en-US-AriaNeural");
console.log("audio url:", url, `(${Date.now() - t0} ms)`);
const head = await fetch(url, { method: "HEAD" });
console.log("HEAD", head.status, head.headers.get("content-type"), head.headers.get("content-length"), "bytes");
