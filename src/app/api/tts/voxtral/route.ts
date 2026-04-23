import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { applyPaidRouteGuards } from "@/lib/paid-route-guard";
import { emit } from "@/lib/audit-log";
import { estimateCost } from "@/lib/pricing";

const sha256Hex = (s: string | Uint8Array | Buffer) =>
  crypto.createHash("sha256").update(s).digest("hex");

/**
 * Proxy route for Mistral Voxtral text-to-speech API.
 * Keeps the API key server-side while returning audio to the client.
 *
 * Uses streaming mode with PCM format for lowest latency (~0.7s
 * time-to-first-audio vs ~3s for non-streaming mp3). SAFETY-03 buffers
 * the SSE chunks server-side so we can hash the full completion + emit
 * the audit record; the buffered MP3 is then returned as a single
 * Content-Length response (ritual-line sizes are small — the buffer is
 * <200ms of extra latency over pipe-through for an honest audit record).
 *
 * Accepts either:
 * - voiceId: UUID of a saved voice profile (requires Mistral paid plan)
 * - refAudio: base64-encoded wav audio for zero-shot voice cloning (free tier)
 */
export async function POST(request: NextRequest) {
  // SAFETY-03: kill-switch + client-token + rate-limit gate.
  const guard = await applyPaidRouteGuards(request, {
    routeName: "tts:voxtral",
  });
  if (guard.kind === "deny") return guard.response;
  const { hashedUser } = guard;

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Mistral API key not configured" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const {
    text,
    voiceId,
    refAudio,
  } = body as {
    text?: string;
    voiceId?: string;
    refAudio?: string;
  };

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (typeof text === "string" && text.length > 2000) {
    return NextResponse.json({ error: `text exceeds 2000 char limit (got ${text.length})` }, { status: 413 });
  }

  // Build the request body
  const speechBody: Record<string, unknown> = {
    model: "voxtral-mini-tts-2603",
    input: text,
    response_format: "mp3",
    stream: true,
  };

  if (voiceId) {
    speechBody.voice_id = voiceId;
  } else if (refAudio) {
    speechBody.ref_audio = refAudio;
  } else {
    // No voice specified — try to find a saved voice from the user's account
    try {
      const voicesResp = await fetch(
        "https://api.mistral.ai/v1/audio/voices?limit=1",
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );
      if (voicesResp.ok) {
        const voicesData = (await voicesResp.json()) as {
          data?: Array<{ id: string }>;
        };
        if (voicesData.data && voicesData.data.length > 0) {
          speechBody.voice_id = voicesData.data[0].id;
        }
      }
    } catch {
      // Fall through to error below
    }

    if (!speechBody.voice_id) {
      return NextResponse.json(
        {
          error:
            "No voice configured. Record a voice sample on the Voices page, or upgrade to Mistral paid plan for saved voice profiles.",
          code: "NO_VOICES",
        },
        { status: 422 }
      );
    }
  }

  const t0 = Date.now();
  const response = await fetch("https://api.mistral.ai/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(speechBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`Voxtral API error (${response.status}):`, errText);
    return NextResponse.json(
      { error: `Voxtral TTS error (${response.status})` },
      { status: response.status }
    );
  }

  // Streaming mode: Mistral sends SSE events with base64 audio chunks.
  // We decode them, concatenate the raw audio bytes, and return the
  // complete MP3 as a single response (post-buffered, not piped).
  const reader = response.body?.getReader();
  if (!reader) {
    return NextResponse.json(
      { error: "No response body from Voxtral" },
      { status: 500 }
    );
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const audioChunks: Buffer[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events (separated by double newlines)
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const dataLine = event
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (!dataLine) continue;

        const jsonStr = dataLine.slice(6); // Remove "data: "
        if (jsonStr === "[DONE]") continue;

        try {
          const parsed = JSON.parse(jsonStr) as {
            choices?: Array<{
              delta?: { audio_data?: string };
            }>;
            data?: { audio_data?: string };
            audio_data?: string;
          };

          const audioData =
            parsed.choices?.[0]?.delta?.audio_data ||
            parsed.data?.audio_data ||
            parsed.audio_data;

          if (audioData) {
            audioChunks.push(Buffer.from(audioData, "base64"));
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  } catch (err) {
    console.error("Voxtral stream error:", err);
    return NextResponse.json(
      { error: "Voxtral stream interrupted" },
      { status: 502 }
    );
  }

  const latencyMs = Date.now() - t0;
  const audioBytes = Buffer.concat(audioChunks);

  // SAFETY-03: emit audit record on successful audio response.
  emit({
    kind: "tts",
    timestamp: new Date().toISOString(),
    hashedUser,
    route: "/api/tts/voxtral",
    promptHash: sha256Hex(text),
    completionHash: sha256Hex(audioBytes),
    estimatedCostUSD: estimateCost("mistral-voxtral-tts", text.length, "per-character"),
    latencyMs,
    model: "mistral-voxtral-tts",
    voice: voiceId ?? "ref-audio",
    charCount: text.length,
  });

  return new NextResponse(new Uint8Array(audioBytes), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audioBytes.length),
      "Cache-Control": "no-cache",
    },
  });
}
