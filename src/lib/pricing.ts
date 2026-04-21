/**
 * Per-model unit-price lookup table (D-08).
 *
 * Source of truth: each provider's currently-published pricing page
 * (not historical Vercel invoices). Each entry carries a `sourceUrl` +
 * `verified` date. When prices drift, edit this table — no external
 * billing API dependency.
 *
 * Server-only. Do NOT import from client code — pricing data is
 * secret-adjacent (it reveals our cost structure) and has no reason to
 * ship in the client bundle.
 *
 * Cached audio playback costs $0 because no route handler runs and
 * therefore no emit() fires. That's implicit: estimateCost() only
 * executes inside paid route handlers, after the upstream call.
 *
 * D-06d: Mistral Small + Voxtral TTS entries are LOW confidence
 * (aggregator-sourced). Shannon cross-verifies at console.mistral.ai
 * before the pricing table ships to production.
 *
 * Unit-type tags (see Pitfall 6 in 02-RESEARCH.md):
 *   - per-input-token / per-output-token: LLM input/output token pricing
 *     (usdPerMillion × units / 1_000_000).
 *   - per-character: TTS per-character pricing (usdPerMillionChars).
 *   - per-audio-minute: STT per-minute pricing (usdPerMinute × minutes).
 *   - per-audio-token: Gemini TTS is the outlier — priced per audio
 *     token (25 tokens per second of output audio).
 *   - self-hosted: kokoro ($0; compute cost accrues as Vercel function
 *     time — track separately as latencyMs only).
 */

export type PricingEntry =
  | { kind: "per-input-token"; usdPerMillion: number; sourceUrl: string; verified: string; notes?: string }
  | { kind: "per-output-token"; usdPerMillion: number; sourceUrl: string; verified: string; notes?: string }
  | { kind: "per-character"; usdPerMillionChars: number; sourceUrl: string; verified: string; notes?: string }
  | { kind: "per-audio-minute"; usdPerMinute: number; sourceUrl: string; verified: string; notes?: string }
  | {
      kind: "per-audio-token";
      usdPerMillion: number;
      audioTokensPerSec: number;
      sourceUrl: string;
      verified: string;
      notes?: string;
    }
  | { kind: "self-hosted"; usdPerUnit: 0; sourceUrl: string; verified: string; notes?: string };

export type UnitType =
  | "per-input-token"
  | "per-output-token"
  | "per-character"
  | "per-audio-minute"
  | "per-audio-token"
  | "self-hosted";

export const PRICING_TABLE: Record<string, PricingEntry> = {
  // ---- Gemini TTS preview family — priced per audio token (Pitfall 6) ----
  "gemini-3.1-flash-tts-preview": {
    kind: "per-audio-token",
    usdPerMillion: 20,
    audioTokensPerSec: 25,
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    verified: "2026-04-21",
    notes:
      "+$1/1M input-text tokens. Preview free tier exists; past quota is paid.",
  },
  "gemini-2.5-flash-preview-tts": {
    kind: "per-audio-token",
    usdPerMillion: 10,
    audioTokensPerSec: 25,
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    verified: "2026-04-21",
    notes: "+$0.50/1M input-text tokens",
  },
  "gemini-2.5-pro-preview-tts": {
    kind: "per-audio-token",
    usdPerMillion: 20,
    audioTokensPerSec: 25,
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    verified: "2026-04-21",
    notes: "+$1/1M input-text tokens. No listed free tier for pro preview.",
  },

  // ---- Groq Whisper STT + Llama LLM ----
  "groq-whisper-large-v3": {
    kind: "per-audio-minute",
    usdPerMinute: 0.00185,
    sourceUrl: "https://groq.com/pricing/",
    verified: "2026-04-21",
    notes: "Minimum 10 seconds per request billed.",
  },
  "groq-llama-3.3-70b-versatile-input": {
    kind: "per-input-token",
    usdPerMillion: 0.59,
    sourceUrl: "https://groq.com/pricing/",
    verified: "2026-04-21",
    notes: "Primary feedback model",
  },
  "groq-llama-3.3-70b-versatile-output": {
    kind: "per-output-token",
    usdPerMillion: 0.79,
    sourceUrl: "https://groq.com/pricing/",
    verified: "2026-04-21",
  },

  // ---- Mistral family — LOW confidence per D-06d ----
  "mistral-small-latest-input": {
    kind: "per-input-token",
    usdPerMillion: 0.2,
    sourceUrl: "https://costbench.com/software/llm-api-providers/mistral-ai/",
    verified: "2026-04-21",
    notes:
      "LOW confidence — verify at console.mistral.ai before merge (D-06d)",
  },
  "mistral-small-latest-output": {
    kind: "per-output-token",
    usdPerMillion: 0.6,
    sourceUrl: "https://costbench.com/software/llm-api-providers/mistral-ai/",
    verified: "2026-04-21",
    notes:
      "LOW confidence — verify at console.mistral.ai before merge (D-06d)",
  },
  "mistral-voxtral-mini-transcribe-v2": {
    kind: "per-audio-minute",
    usdPerMinute: 0.003,
    sourceUrl: "https://mistral.ai/news/voxtral-transcribe-2",
    verified: "2026-04-21",
  },
  "mistral-voxtral-tts": {
    kind: "per-character",
    usdPerMillionChars: 16000,
    sourceUrl: "https://www.datacamp.com/blog/voxtral-tts",
    verified: "2026-04-21",
    notes:
      "LOW confidence — secondary source (D-06d); verify before merge. ~$0.016/1000 chars.",
  },

  // ---- ElevenLabs TTS ----
  elevenlabs: {
    kind: "per-character",
    usdPerMillionChars: 120,
    sourceUrl: "https://elevenlabs.io/pricing/api",
    verified: "2026-04-21",
    notes:
      "Multilingual v2/v3 PAYG API $0.12/1000 chars. Flash/Turbo models $0.06/1000 — if used, add separate entry.",
  },

  // ---- Google Cloud TTS tiers ----
  "google-tts-neural2": {
    kind: "per-character",
    usdPerMillionChars: 16,
    sourceUrl: "https://cloud.google.com/text-to-speech/pricing",
    verified: "2026-04-21",
    notes: "Free tier: first 1M chars/month.",
  },
  "google-tts-chirp3-hd": {
    kind: "per-character",
    usdPerMillionChars: 30,
    sourceUrl: "https://cloud.google.com/text-to-speech/pricing",
    verified: "2026-04-21",
    notes: "Premium tier",
  },
  "google-tts-studio": {
    kind: "per-character",
    usdPerMillionChars: 160,
    sourceUrl: "https://cloud.google.com/text-to-speech/pricing",
    verified: "2026-04-21",
    notes: "Emergency-only tier",
  },

  // ---- Deepgram TTS (Aura family) ----
  "deepgram-aura-2": {
    kind: "per-character",
    usdPerMillionChars: 30,
    sourceUrl: "https://deepgram.com/pricing",
    verified: "2026-04-21",
    notes: "PAYG rate $0.030/1000 chars",
  },
  "deepgram-aura-1": {
    kind: "per-character",
    usdPerMillionChars: 15,
    sourceUrl: "https://deepgram.com/pricing",
    verified: "2026-04-21",
    notes: "Cheaper fallback $0.015/1000 chars",
  },

  // ---- Self-hosted ----
  kokoro: {
    kind: "self-hosted",
    usdPerUnit: 0,
    sourceUrl: "https://github.com/hexgrad/kokoro",
    verified: "2026-04-21",
    notes:
      "Compute cost accrues as Vercel function time — track separately as latencyMs only.",
  },
};

/**
 * Compute USD cost for a given model + unit count.
 *
 * Returns 0 (and emits a `[PRICING]` console.warn) for:
 *   - unknown model id
 *   - unit-type mismatch vs the entry's declared kind
 *   - self-hosted models (always $0)
 *   - non-finite or non-positive units
 */
export function estimateCost(
  modelId: string,
  units: number,
  unitType: UnitType,
): number {
  const entry = PRICING_TABLE[modelId];
  if (!entry) {
    console.warn(`[PRICING] unknown model: ${modelId}`);
    return 0;
  }
  if (entry.kind === "self-hosted") {
    return 0;
  }
  if (unitType !== entry.kind) {
    console.warn(
      `[PRICING] unit-type mismatch for ${modelId}: expected ${entry.kind}, got ${unitType}`,
    );
    return 0;
  }
  if (!Number.isFinite(units) || units <= 0) {
    return 0;
  }
  switch (entry.kind) {
    case "per-input-token":
    case "per-output-token":
      return (units * entry.usdPerMillion) / 1_000_000;
    case "per-character":
      return (units * entry.usdPerMillionChars) / 1_000_000;
    case "per-audio-minute":
      return units * entry.usdPerMinute;
    case "per-audio-token":
      return (units * entry.usdPerMillion) / 1_000_000;
  }
}
