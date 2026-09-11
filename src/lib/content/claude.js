import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

/**
 * Claude client for persona content. Uses structured outputs (zod schema),
 * adaptive thinking, and server-side refusal fallbacks.
 */
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";

let _client = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  if (!_client) _client = new Anthropic();
  return _client;
}

export class ClaudeError extends Error {
  constructor(message, { retryable = false, cause } = {}) {
    super(message);
    this.name = "ClaudeError";
    this.retryable = retryable;
    this.cause = cause;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.system   stable system prompt (cached)
 * @param {string|Array} opts.user  user text or content blocks (images allowed)
 * @param {import("zod").ZodType} opts.schema
 * @param {"low"|"medium"|"high"} [opts.effort]
 */
export async function generateStructured({ system, user, schema, effort = "medium", maxTokens = 8000 }) {
  const content = typeof user === "string" ? [{ type: "text", text: user }] : user;
  try {
    const response = await client().beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort, format: zodOutputFormat(schema) },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      throw new ClaudeError(`Claude declined: ${response.stop_details?.explanation || response.stop_details?.category || "refusal"}`);
    }
    if (response.parsed_output) return { data: schema.parse(response.parsed_output), usage: response.usage };

    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return { data: schema.parse(JSON.parse(text)), usage: response.usage };
  } catch (err) {
    if (err instanceof ClaudeError) throw err;
    if (err instanceof Anthropic.RateLimitError) throw new ClaudeError("Claude rate limited", { retryable: true, cause: err });
    if (err instanceof Anthropic.APIConnectionError) throw new ClaudeError("Claude connection error", { retryable: true, cause: err });
    if (err instanceof Anthropic.APIError && err.status >= 500) throw new ClaudeError(`Claude server error ${err.status}`, { retryable: true, cause: err });
    throw new ClaudeError(err.message || "Claude request failed", { cause: err });
  }
}

/** Rough cost in cents from usage, for the pipeline ledger. */
export function usageCents(usage) {
  if (!usage) return 0;
  const opus = CLAUDE_MODEL.includes("opus");
  const inRate = opus ? 5 : 2; // $ per MTok
  const outRate = opus ? 25 : 10;
  const cacheRead = (usage.cache_read_input_tokens || 0) * inRate * 0.1;
  const cacheWrite = (usage.cache_creation_input_tokens || 0) * inRate * 1.25;
  const input = (usage.input_tokens || 0) * inRate;
  const output = (usage.output_tokens || 0) * outRate;
  return Math.round(((cacheRead + cacheWrite + input + output) / 1_000_000) * 100);
}
