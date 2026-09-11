import { wsSubmit, wsResult } from "./wavespeed";
import { RENDER } from "@/lib/render/models";

export function triggerWordFor(actor) {
  return `${(actor.slug || actor.name).toLowerCase().replace(/[^a-z0-9]/g, "")}pet`;
}

/** Submit a FLUX LoRA training run. Returns the prediction id. */
export async function submitLoraTraining(actor, datasetUrl) {
  return wsSubmit(RENDER.lora.slug, {
    data: datasetUrl,
    trigger_word: triggerWordFor(actor),
    steps: 1000,
    learning_rate: 0.0004,
    lora_rank: 16,
  });
}

/** Poll once; returns { status, loraUrl?, error? }. */
export async function checkLoraTraining(predictionId) {
  const r = await wsResult(predictionId);
  if (r.status !== "completed") return r;
  const out = r.outputs.find((o) => typeof o === "string" && /\.safetensors(\?|$)/i.test(o)) || r.outputs[0];
  const loraUrl = typeof out === "object" ? out?.url || out?.path : out;
  return loraUrl ? { status: "completed", loraUrl } : { status: "failed", error: "Training finished without a LoRA file" };
}
