const BASE = "https://api.muapi.ai/api/v1";

const muapi = {
  id: "muapi",
  label: "MUAPI",
  description: "Frontier models (Veo 3.1, Seedance 2, Grok) through the MUAPI.ai gateway. Small free grant on signup, then pay per video.",
  envKey: "MUAPI_API_KEY",
  legacyEnvKey: "UGC_API_KEY",
  allowUserKey: true,
  keyHint: "MUAPI key (mu_...)",
  keyUrl: "https://muapi.ai",
  models: [
    {
      id: "muapi/grok-video",
      endpoint: `${BASE}/grok-imagine-image-to-video`,
      name: "Grok Video",
      description: "xAI's Grok video model. Cheapest frontier option.",
      kind: "i2v",
      params: {
        aspect_ratio: { options: ["9:16", "16:9", "2:3", "3:2", "1:1"], default: "9:16" },
        mode: { options: ["fun", "normal", "spicy"], default: "normal" },
        resolution: { options: ["480p", "720p"], default: "480p" },
        duration: { min: 6, max: 30, default: 6 },
      },
      costPerSecond: 5,
      rates: { "480p": 5, "720p": 10 },
    },
    {
      id: "muapi/veo-3-1",
      endpoint: `${BASE}/veo3.1-image-to-video`,
      name: "Veo 3.1",
      description: "Google's high-fidelity model with native audio. Expensive.",
      kind: "i2v",
      params: {
        aspect_ratio: { options: ["16:9", "9:16"], default: "9:16" },
        duration: { options: [8], default: 8 },
        resolution: { options: ["720p", "1080p", "4k"], default: "720p" },
      },
      costPerSecond: 500,
      rates: { "720p": 500, "1080p": 650, "4k": 740 },
    },
    {
      id: "muapi/happy-horse",
      endpoint: `${BASE}/happy-horse-1-image-to-video-720p`,
      name: "Happy Horse 1",
      description: "Fast, expressive animation at 720p.",
      kind: "i2v",
      params: {
        aspect_ratio: { options: ["16:9", "9:16", "1:1", "4:3", "3:4"], default: "9:16" },
        duration: { min: 3, max: 15, default: 5 },
      },
      costPerSecond: 36,
    },
    {
      id: "muapi/seedance-2",
      endpoint: `${BASE}/seedance-2-image-to-video`,
      name: "Seedance 2",
      description: "ByteDance's model with strong character reference support.",
      kind: "i2v",
      params: {
        aspect_ratio: { options: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], default: "9:16" },
        duration: { min: 4, max: 15, default: 5 },
      },
      costPerSecond: 50,
    },
  ],

  async submit({ model, prompt, images, settings = {}, apiKey, webhookUrl }) {
    if (!apiKey) throw new Error("MUAPI key is not configured");
    if (!images?.length) throw new Error("This model needs an actor or reference image");
    const payload = {
      prompt,
      images_list: images,
      image_url: images[0],
      webhook_url: webhookUrl,
      ...settings,
    };
    const res = await fetch(model.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MUAPI request failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    const requestId = data.request_id || data.id;
    if (!requestId) throw new Error("MUAPI did not return a request id");
    return { requestId };
  },

  async status({ requestId, apiKey }) {
    if (!apiKey) return { status: "processing" };
    const res = await fetch(`${BASE}/predictions/${requestId}/result`, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });
    if (!res.ok) return { status: "processing" };
    const data = await res.json();
    return muapi.parseResult(data);
  },

  /** Shared by the polling path and the webhook route. */
  parseResult(data) {
    const s = String(data.status || "processing").toLowerCase();
    if (s === "failed" || (data.error && data.error !== "")) {
      return { status: "failed", error: data.error || "Generation failed" };
    }
    if (s === "completed" || (Array.isArray(data.outputs) && data.outputs.length > 0)) {
      const url = Array.isArray(data.outputs) ? data.outputs[0] : null;
      return url ? { status: "completed", url } : { status: "failed", error: "Completed without output" };
    }
    return { status: "processing" };
  },
};

export default muapi;
