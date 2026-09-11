import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { put } from "@vercel/blob";
export { estimateSpeechSeconds } from "@/lib/credits";

/**
 * Voices exposed in the UI. Any Microsoft Edge neural voice ShortName works.
 */
export const VOICES = [
  { id: "en-US-AriaNeural", label: "Aria (US, female)" },
  { id: "en-US-JennyNeural", label: "Jenny (US, female)" },
  { id: "en-US-AnaNeural", label: "Ana (US, young female)" },
  { id: "en-US-GuyNeural", label: "Guy (US, male)" },
  { id: "en-US-ChristopherNeural", label: "Christopher (US, male)" },
  { id: "en-GB-SoniaNeural", label: "Sonia (UK, female)" },
  { id: "en-GB-RyanNeural", label: "Ryan (UK, male)" },
  { id: "en-AU-NatashaNeural", label: "Natasha (AU, female)" },
];

export const DEFAULT_VOICE = VOICES[0].id;

/**
 * Synthesize `text` with Microsoft Edge's free neural TTS and upload the MP3
 * to Vercel Blob. Returns the public URL.
 */
export async function synthesizeToBlob(text, voice = DEFAULT_VOICE) {
  const clean = String(text || "").trim();
  if (!clean) throw new Error("Script is empty");
  if (clean.length > 2000) throw new Error("Script is too long (max 2000 characters)");

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const { audioStream } = tts.toStream(clean);
  const chunks = [];
  for await (const chunk of audioStream) chunks.push(Buffer.from(chunk));
  tts.close();

  const buffer = Buffer.concat(chunks);
  if (buffer.length < 1000) throw new Error("Text-to-speech returned no audio");

  const blob = await put(`tts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`, buffer, {
    access: "public",
    contentType: "audio/mpeg",
    addRandomSuffix: false,
  });
  return blob.url;
}
