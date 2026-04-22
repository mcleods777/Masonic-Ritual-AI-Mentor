import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { applyPaidRouteGuards } from "@/lib/paid-route-guard";
import { emit } from "@/lib/audit-log";
import { estimateCost } from "@/lib/pricing";

const sha256Hex = (s: string | Uint8Array | Buffer) =>
  crypto.createHash("sha256").update(s).digest("hex");

/**
 * Proxy route for ElevenLabs text-to-speech API.
 * Keeps the API key server-side while returning audio to the client.
 */
export async function POST(request: NextRequest) {
  // SAFETY-03: kill-switch + client-token + rate-limit gate.
  const guard = await applyPaidRouteGuards(request, {
    routeName: "tts:elevenlabs",
  });
  if (guard.kind === "deny") return guard.response;
  const { hashedUser } = guard;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ElevenLabs API key not configured" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const {
    text,
    voiceId = "pNInz6obpgDQGcFmaJgB", // Adam — default
    modelId = "eleven_multilingual_v2",
    stability = 0.5,
    similarityBoost = 0.75,
  } = body as {
    text?: string;
    voiceId?: string;
    modelId?: string;
    stability?: number;
    similarityBoost?: number;
  };

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (typeof text === "string" && text.length > 2000) {
    return NextResponse.json({ error: `text exceeds 2000 char limit (got ${text.length})` }, { status: 413 });
  }

  const t0 = Date.now();
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability, similarity_boost: similarityBoost },
      }),
    }
  );
  const latencyMs = Date.now() - t0;

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json(
      { error: `ElevenLabs API error: ${errText}` },
      { status: response.status }
    );
  }

  const audioBuffer = await response.arrayBuffer();
  const audioBytes = Buffer.from(audioBuffer);

  // SAFETY-03: emit audit record on successful audio response.
  // ElevenLabs is priced per-character — use PRICING_TABLE "elevenlabs"
  // entry (models share pricing at PAYG tier).
  emit({
    kind: "tts",
    timestamp: new Date().toISOString(),
    hashedUser,
    route: "/api/tts/elevenlabs",
    promptHash: sha256Hex(text),
    completionHash: sha256Hex(audioBytes),
    estimatedCostUSD: estimateCost("elevenlabs", text.length, "per-character"),
    latencyMs,
    model: modelId,
    voice: voiceId,
    charCount: text.length,
  });

  return new NextResponse(audioBuffer, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
