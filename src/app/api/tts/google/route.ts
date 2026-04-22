import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { applyPaidRouteGuards } from "@/lib/paid-route-guard";
import { emit } from "@/lib/audit-log";
import { estimateCost } from "@/lib/pricing";

const sha256Hex = (s: string | Uint8Array | Buffer) =>
  crypto.createHash("sha256").update(s).digest("hex");

/**
 * Map a Google Cloud TTS voice name to a PRICING_TABLE tier key.
 * Voice names look like "en-US-Neural2-D", "en-US-Chirp3-HD-Achernar",
 * "en-US-Studio-O". We pick the table entry by checking the tier segment.
 * Unknown tier defaults to neural2 (the cheapest metered tier and the
 * route's default voice family).
 */
function googleVoiceToModelId(voiceName: string): string {
  const lower = voiceName.toLowerCase();
  if (lower.includes("studio")) return "google-tts-studio";
  if (lower.includes("chirp3")) return "google-tts-chirp3-hd";
  return "google-tts-neural2";
}

/**
 * Proxy route for Google Cloud Text-to-Speech API.
 * Keeps the API key server-side while returning audio to the client.
 */
export async function POST(request: NextRequest) {
  // SAFETY-03: kill-switch + client-token + rate-limit gate.
  const guard = await applyPaidRouteGuards(request, {
    routeName: "tts:google",
  });
  if (guard.kind === "deny") return guard.response;
  const { hashedUser } = guard;

  const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Cloud TTS API key not configured" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const {
    text,
    voiceName = "en-US-Neural2-D",
    languageCode = "en-US",
    pitch = 0,
    speakingRate = 1.0,
  } = body as {
    text?: string;
    voiceName?: string;
    languageCode?: string;
    pitch?: number;
    speakingRate?: number;
  };

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (typeof text === "string" && text.length > 2000) {
    return NextResponse.json({ error: `text exceeds 2000 char limit (got ${text.length})` }, { status: 413 });
  }

  // Derive language code from voice name prefix (e.g. "en-GB-Neural2-B" → "en-GB")
  const derivedLang = voiceName.match(/^[a-z]{2}-[A-Z]{2}/)?.[0] ?? languageCode;

  const t0 = Date.now();
  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: derivedLang, name: voiceName },
        audioConfig: {
          audioEncoding: "MP3",
          pitch,
          speakingRate,
        },
      }),
    }
  );
  const latencyMs = Date.now() - t0;

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json(
      { error: `Google Cloud TTS error: ${errText}` },
      { status: response.status }
    );
  }

  const data = (await response.json()) as { audioContent: string };
  const audioBytes = Buffer.from(data.audioContent, "base64");

  // SAFETY-03: emit audit record. Google Cloud TTS is priced per-character
  // but the per-million-char rate depends on the voice tier — map voice
  // name → pricing-table key.
  const modelId = googleVoiceToModelId(voiceName);
  emit({
    kind: "tts",
    timestamp: new Date().toISOString(),
    hashedUser,
    route: "/api/tts/google",
    promptHash: sha256Hex(text),
    completionHash: sha256Hex(audioBytes),
    estimatedCostUSD: estimateCost(modelId, text.length, "per-character"),
    latencyMs,
    model: modelId,
    voice: voiceName,
    charCount: text.length,
  });

  return new NextResponse(audioBytes, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
