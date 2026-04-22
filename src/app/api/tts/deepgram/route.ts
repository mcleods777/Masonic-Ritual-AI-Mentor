import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { applyPaidRouteGuards } from "@/lib/paid-route-guard";
import { emit } from "@/lib/audit-log";
import { estimateCost } from "@/lib/pricing";

const sha256Hex = (s: string | Uint8Array | Buffer) =>
  crypto.createHash("sha256").update(s).digest("hex");

/**
 * Map a Deepgram Aura model name to a PRICING_TABLE entry key.
 * aura-1 models → deepgram-aura-1 ($0.015/1K); aura-2 models →
 * deepgram-aura-2 ($0.030/1K). Default to aura-2 (the current default
 * voice "aura-2-orion-en" is the Aura-2 family).
 */
function deepgramModelToPricingKey(model: string): string {
  if (model.toLowerCase().startsWith("aura-1")) return "deepgram-aura-1";
  return "deepgram-aura-2";
}

/**
 * Proxy route for Deepgram Aura-2 text-to-speech API.
 * Keeps the API key server-side while returning audio to the client.
 */
export async function POST(request: NextRequest) {
  // SAFETY-03: kill-switch + client-token + rate-limit gate.
  const guard = await applyPaidRouteGuards(request, {
    routeName: "tts:deepgram",
  });
  if (guard.kind === "deny") return guard.response;
  const { hashedUser } = guard;

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Deepgram API key not configured" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const {
    text,
    model = "aura-2-orion-en",
  } = body as {
    text?: string;
    model?: string;
  };

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (typeof text === "string" && text.length > 2000) {
    return NextResponse.json({ error: `text exceeds 2000 char limit (got ${text.length})` }, { status: 413 });
  }

  const MAX_RETRIES = 2;
  const RETRY_DELAYS = [500, 1500];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const t0 = Date.now();
    const response = await fetch(
      `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=mp3`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      }
    );
    const latencyMs = Date.now() - t0;

    if (response.ok) {
      // Buffer the audio so we can hash it + emit the audit record.
      // (Previously we streamed the body through via Transfer-Encoding:
      // chunked; the buffered path is equivalent for MP3 playback at
      // ritual-line sizes and keeps the audit record honest.)
      const audioBuffer = await response.arrayBuffer();
      const audioBytes = Buffer.from(audioBuffer);
      const pricingKey = deepgramModelToPricingKey(model);
      emit({
        kind: "tts",
        timestamp: new Date().toISOString(),
        hashedUser,
        route: "/api/tts/deepgram",
        promptHash: sha256Hex(text),
        completionHash: sha256Hex(audioBytes),
        estimatedCostUSD: estimateCost(pricingKey, text.length, "per-character"),
        latencyMs,
        model: pricingKey,
        voice: model,
        charCount: text.length,
      });
      return new NextResponse(audioBuffer, {
        headers: { "Content-Type": "audio/mpeg" },
      });
    }

    // Retry on transient errors (429 rate limit, 500/503 server errors)
    const isRetryable = response.status === 429 || response.status >= 500;
    if (isRetryable && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      continue;
    }

    const errText = await response.text();
    return NextResponse.json(
      { error: `Deepgram API error: ${errText}` },
      { status: response.status }
    );
  }
}
