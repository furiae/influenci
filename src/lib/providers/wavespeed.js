import { synthesizeToBlob, DEFAULT_VOICE, VOICES } from "@/lib/tts";

const BASE = "https://api.wavespeed.ai/api/v3";

// 1 credit = $0.005 (see config.stripe.plans). Wavespeed prices:
//   Wan 2.2 i2v/t2v 480p  $0.15 / 5s  => $0.03/s  => 6 credits/s
//   Wan 2.2 i2v 720p      $0.30 / 5s  => $0.06/s  => 12 credits/s
//   InfiniteTalk 480p     $0.03/s, 720p $0.06/s
const VOICE_PARAM = { options: VOICES.map((v) => v.id), labels: Object.fromEntries(VOICES.map((v) => [v.id, v.label])), default: DEFAULT_VOICE };

const wavespeed = {
  id: "wavespeed",
  label: "Wavespeed",
  description: "Wan 2.2 and InfiniteTalk via Wavespeed.ai. $1 free on signup, then about $0.15 per 5-second clip.",
  envKey: "WAVESPEED_API_KEY",
  allowUserKey: true,
  keyHint: "Wavespeed API key",
  keyUrl: "https://wavespeed.ai",
  models: [
    {
      id: "wavespeed/wan-2.2-i2v-480p",
      slug: "wavespeed-ai/wan-2.2/i2v-480p",
      name: "Wan 2.2 Image→Video 480p",
      description: "Animate your actor or product photo. Fast and cheap; ~40 s to render.",
      kind: "i2v",
      params: { duration: { options: [5, 8], default: 5 } },
      costPerSecond: 6,
    },
    {
      id: "wavespeed/wan-2.2-i2v-720p",
      slug: "wavespeed-ai/wan-2.2/i2v-720p",
      name: "Wan 2.2 Image→Video 720p",
      description: "Same model at 720p. ~2.5 min to render.",
      kind: "i2v",
      params: { duration: { options: [5, 8], default: 5 } },
      costPerSecond: 12,
    },
    {
      id: "wavespeed/wan-2.2-t2v-480p",
      slug: "wavespeed-ai/wan-2.2/t2v-480p",
      name: "Wan 2.2 Text→Video 480p",
      description: "No reference image needed. Describe the scene and the actor.",
      kind: "t2v",
      params: {
        aspect_ratio: { options: ["9:16", "16:9"], default: "9:16" },
        duration: { options: [5, 8], default: 5 },
      },
      costPerSecond: 6,
    },
    {
      id: "wavespeed/infinitetalk",
      slug: "wavespeed-ai/infinitetalk",
      name: "Talking Actor (InfiniteTalk)",
      description: "Your actor speaks the script. Voice is generated for free, video billed per second of speech.",
      kind: "lipsync",
      params: {
        resolution: { options: ["480p", "720p"], default: "480p" },
        voice: VOICE_PARAM,
      },
      costPerSecond: 6,
      rates: { "480p": 6, "720p": 12 },
    },
  ],

  async submit({ model, prompt, images, settings = {}, apiKey }) {
    if (!apiKey) throw new Error("Wavespeed API key is not configured");
    const image = images?.[0];
    let body;
    let meta = {};

    if (model.kind === "i2v") {
      if (!image) throw new Error("This model needs an actor or reference image");
      body = { image, prompt, duration: Number(settings.duration) || 5 };
    } else if (model.kind === "t2v") {
      const portrait = (settings.aspect_ratio || "9:16") === "9:16";
      body = { prompt, size: portrait ? "480*832" : "832*480", duration: Number(settings.duration) || 5 };
    } else if (model.kind === "lipsync") {
      if (!image) throw new Error("Pick an actor for the talking video");
      const audioUrl = await synthesizeToBlob(prompt, settings.voice || DEFAULT_VOICE);
      meta = { audioUrl, voice: settings.voice || DEFAULT_VOICE };
      body = { image, audio: audioUrl, resolution: settings.resolution || "480p" };
    } else {
      throw new Error(`Unsupported model kind ${model.kind}`);
    }

    const res = await fetch(`${BASE}/${model.slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Wavespeed request failed (${res.status}): ${json.message || json.error || JSON.stringify(json)}`);
    }
    const requestId = json?.data?.id || json?.id;
    if (!requestId) throw new Error("Wavespeed did not return a prediction id");
    return { requestId, meta };
  },

  async status({ requestId, apiKey }) {
    if (!apiKey) return { status: "processing" };
    const res = await fetch(`${BASE}/predictions/${requestId}/result`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { status: "processing" };
    const data = json.data || json;
    const s = String(data.status || "processing").toLowerCase();
    if (s === "completed") {
      const url = Array.isArray(data.outputs) ? data.outputs[0] : null;
      return url ? { status: "completed", url } : { status: "failed", error: "Completed without output" };
    }
    if (["failed", "cancelled", "timeout", "deleted"].includes(s)) {
      return { status: "failed", error: data.error || `Provider reported ${s}` };
    }
    return { status: "processing" };
  },
};

export default wavespeed;
