import { synthesizeToBlob, DEFAULT_VOICE, VOICES } from "../tts.js";

/**
 * Free provider: public Hugging Face Spaces running on ZeroGPU, called through
 * Gradio's two-step REST API (POST /gradio_api/call/<fn> -> event_id, then
 * GET /gradio_api/call/<fn>/<event_id> as a server-sent event stream).
 *
 * Quota: ~5 GPU-minutes per day for a free HF token (about 3-5 short clips),
 * shared by every user of this deployment. Queues can take minutes. Spaces are
 * owned by third parties and can change or disappear; each Space's endpoint
 * and argument order live in SPACES below so they can be patched quickly.
 */

const NEG = "blurry, low quality, distorted, deformed, extra fingers, bad hands, bad face, text, watermark, static";

const SPACES = {
  wan: {
    host: "https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space",
    fn: "/generate_video",
    // [input_image, prompt, steps, negative_prompt, duration_seconds, guidance_scale, guidance_scale_2, seed, randomize_seed]
    args: ({ imageUrl, prompt, duration }) => [file(imageUrl), prompt, 6, NEG, clamp(duration, 1, 5), 1, 1, 42, true],
  },
  ltx: {
    host: "https://lightricks-ltx-video-distilled.hf.space",
    fn: "/text_to_video",
    // [prompt, negative_prompt, input_image_filepath, input_video_filepath, height_ui, width_ui, mode, duration_ui, ui_frames_to_use, seed_ui, randomize_seed, ui_guidance_scale, improve_texture_flag]
    args: ({ prompt, portrait, duration }) => [
      prompt, NEG, null, null,
      portrait ? 704 : 512, portrait ? 512 : 704,
      "text-to-video", clamp(duration, 1, 5), 9, 42, true, 1, true,
    ],
  },
  latentsync: {
    host: "https://fffiloni-latentsync.hf.space",
    fn: "/generate_lip_sync_video",
    // [input_video_path, input_audio_path]
    args: ({ videoUrl, audioUrl }) => [file(videoUrl), file(audioUrl)],
  },
};

function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return hi;
  return Math.min(hi, Math.max(lo, v));
}

function file(url) {
  return { path: url, url, meta: { _type: "gradio.FileData" } };
}

function token() {
  return process.env.HF_TOKEN || null;
}

async function gradioCall(space, argValues) {
  const headers = { "Content-Type": "application/json" };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;

  const submit = await fetch(`${space.host}/gradio_api/call${space.fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ data: argValues }),
  });
  if (!submit.ok) {
    const text = await submit.text();
    throw new Error(`Space ${space.host} rejected the job (${submit.status}): ${text.slice(0, 300)}`);
  }
  const { event_id: eventId } = await submit.json();
  if (!eventId) throw new Error(`Space ${space.host} returned no event id`);

  const stream = await fetch(`${space.host}/gradio_api/call${space.fn}/${eventId}`, { headers });
  if (!stream.ok || !stream.body) {
    throw new Error(`Space ${space.host} result stream failed (${stream.status})`);
  }

  // Parse SSE: lines of "event: <name>" followed by "data: <json>".
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.startsWith("event:")) currentEvent = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (currentEvent === "complete") {
          return JSON.parse(payload);
        }
        if (currentEvent === "error") {
          let msg = payload;
          try { msg = JSON.parse(payload)?.message || JSON.parse(payload) || payload; } catch {}
          throw new Error(`Space error: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
        }
      }
    }
  }
  throw new Error("Space stream ended without a result");
}

function outputUrl(space, value) {
  // Video outputs arrive as FileData or { video: FileData }.
  const fd = value?.video ?? value;
  const url = fd?.url || (fd?.path ? `${space.host}/gradio_api/file=${fd.path}` : null);
  if (!url) throw new Error("Space returned no video file");
  return url;
}

const VOICE_PARAM = { options: VOICES.map((v) => v.id), labels: Object.fromEntries(VOICES.map((v) => [v.id, v.label])), default: DEFAULT_VOICE };

const zerogpu = {
  id: "zerogpu",
  label: "Free (community GPU)",
  description: "Runs on public Hugging Face ZeroGPU Spaces. $0, but only a few clips per day, slow queues, and occasional failures.",
  envKey: null,
  allowUserKey: false,
  models: [
    {
      id: "zerogpu/wan-2.2-i2v",
      name: "Free: Wan 2.2 Image→Video",
      description: "Animate your actor for up to 5 seconds on a shared community GPU.",
      kind: "i2v",
      params: { duration: { options: [3, 5], default: 3 } },
      costPerSecond: 0,
      free: true,
    },
    {
      id: "zerogpu/ltx-t2v",
      name: "Free: LTX Text→Video",
      description: "Fast text-to-video, no image needed. Lower quality than Wan.",
      kind: "t2v",
      params: {
        aspect_ratio: { options: ["9:16", "16:9"], default: "9:16" },
        duration: { options: [2, 3, 5], default: 3 },
      },
      costPerSecond: 0,
      free: true,
    },
    {
      id: "zerogpu/talking-actor",
      name: "Free: Talking Actor",
      description: "Actor photo → short clip → lip-synced to a generated voice (Wan 2.2 + LatentSync). Two GPU jobs; expect several minutes.",
      kind: "lipsync",
      params: { voice: VOICE_PARAM },
      costPerSecond: 0,
      free: true,
    },
  ],

  async submit({ model, prompt, images, settings = {} }) {
    const imageUrl = images?.[0];
    const requestId = `zg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    if (model.id === "zerogpu/wan-2.2-i2v") {
      if (!imageUrl) throw new Error("This model needs an actor or reference image");
      const duration = Number(settings.duration) || 3;
      return {
        requestId,
        run: async () => {
          const out = await gradioCall(SPACES.wan, SPACES.wan.args({ imageUrl, prompt, duration }));
          return { url: outputUrl(SPACES.wan, out[0]) };
        },
      };
    }

    if (model.id === "zerogpu/ltx-t2v") {
      const portrait = (settings.aspect_ratio || "9:16") === "9:16";
      const duration = Number(settings.duration) || 3;
      return {
        requestId,
        run: async () => {
          const out = await gradioCall(SPACES.ltx, SPACES.ltx.args({ prompt, portrait, duration }));
          return { url: outputUrl(SPACES.ltx, out[0]) };
        },
      };
    }

    if (model.id === "zerogpu/talking-actor") {
      if (!imageUrl) throw new Error("Pick an actor for the talking video");
      const audioUrl = await synthesizeToBlob(prompt, settings.voice || DEFAULT_VOICE);
      return {
        requestId,
        meta: { audioUrl, voice: settings.voice || DEFAULT_VOICE },
        run: async () => {
          const motionPrompt = "a person talking to the camera, subtle natural head movement, steady framing";
          const step1 = await gradioCall(SPACES.wan, SPACES.wan.args({ imageUrl, prompt: motionPrompt, duration: 5 }));
          const videoUrl = outputUrl(SPACES.wan, step1[0]);
          const step2 = await gradioCall(SPACES.latentsync, SPACES.latentsync.args({ videoUrl, audioUrl }));
          return { url: outputUrl(SPACES.latentsync, step2[0]) };
        },
      };
    }

    throw new Error(`Unknown model ${model.id}`);
  },

  /**
   * Work happens in the background job started by the generate route, which
   * writes the final state to the database. Here we only time out jobs whose
   * function instance died before finishing.
   */
  async status({ creation }) {
    const started = new Date(creation.createdAt).getTime();
    const ageMs = Date.now() - started;
    if (ageMs > 15 * 60 * 1000) {
      return { status: "failed", error: "Timed out waiting for the community GPU. Try again later or use a paid model." };
    }
    return { status: "processing" };
  },
};

export default zerogpu;
