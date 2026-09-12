/**
 * "Watch" a competitor video with Google Gemini (free tier accepts video,
 * including public YouTube links without downloading). Returns a structured
 * breakdown the writer can learn from.
 */
const MODELS = [process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-2.5-flash"].filter(Boolean);

const SCHEMA = {
  type: "OBJECT",
  properties: {
    hook: { type: "STRING", description: "What happens in the first 1-3 seconds, quoted or described" },
    summary: { type: "STRING", description: "2-3 sentence summary of the content" },
    structure: { type: "STRING", description: "Beat-by-beat structure with rough timestamps" },
    visualStyle: { type: "STRING", description: "Framing, editing pace, text overlays, lighting, setting" },
    audioStyle: { type: "STRING", description: "Voiceover vs on-camera speech, music, sound effects" },
    whyItWorks: { type: "STRING", description: "Why this likely performs well: emotion, curiosity, relatability, payoff" },
    onScreenText: { type: "STRING", description: "Any on-screen text, verbatim if short" },
    cta: { type: "STRING", description: "Call to action, if any" },
    transcriptExcerpt: { type: "STRING", description: "Up to ~120 words of the most important spoken lines" },
    formatLabel: { type: "STRING", description: "Short label for the format, e.g. 'POV skit', 'listicle', 'talking head tip', 'vlog montage'" },
    durationSec: { type: "NUMBER" },
  },
  required: ["hook", "summary", "structure", "visualStyle", "whyItWorks", "formatLabel"],
};

const PROMPT = `You are analysing a short-form social video for a creator who wants to make similar (not copied) content. Describe exactly what happens and why it works. Be concrete: quote the hook, note timestamps (MM:SS), on-screen text, camera framing, editing pace, and the emotional payoff. If the video is silent or ambient, say so.`;

async function callGemini(model, parts) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured (free at aistudio.google.com)");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.2 },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Gemini ${model}: ${json.error?.message || res.status}`);
    err.status = res.status;
    err.code = json.error?.status;
    throw err;
  }
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text) throw new Error(`Gemini ${model}: empty response (${json.promptFeedback?.blockReason || "no candidates"})`);
  return JSON.parse(text);
}

/**
 * @param {object} o
 * @param {string} [o.youtubeUrl]  public YouTube URL (no download needed)
 * @param {string} [o.videoUrl]    direct mp4 URL (fetched and sent inline; ≤ 20 MB)
 * @param {string} [o.context]     extra context (platform, caption)
 */
export async function analyzeVideo({ youtubeUrl, videoUrl, context = "" }) {
  const parts = [{ text: `${PROMPT}\n\nContext: ${context || "(none)"}` }];
  if (youtubeUrl) {
    parts.push({ file_data: { file_uri: youtubeUrl, mime_type: "video/*" } });
  } else if (videoUrl) {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`Could not download video (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 19 * 1024 * 1024) throw new Error("Video larger than 19 MB; skip or use YouTube");
    parts.push({ inline_data: { mime_type: res.headers.get("content-type")?.split(";")[0] || "video/mp4", data: buf.toString("base64") } });
  } else {
    throw new Error("No video source");
  }

  let lastErr;
  for (const model of MODELS) {
    try {
      const out = await callGemini(model, parts);
      return { ...out, model };
    } catch (err) {
      lastErr = err;
      if (err.status === 404 || /not found|not supported/i.test(err.message)) continue; // try the next model id
      throw err;
    }
  }
  throw lastErr || new Error("No Gemini model available");
}

export function isYouTube(url) {
  return /(^https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(url || "");
}
