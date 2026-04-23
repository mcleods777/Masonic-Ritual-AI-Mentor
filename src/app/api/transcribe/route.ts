/**
 * Speech-to-text API route using Groq's Whisper endpoint.
 * Accepts audio blobs from the browser and returns a transcript.
 *
 * SAFETY-03: guard at the top runs BEFORE request.formData() — the
 * guard only reads headers/cookies/Bearer, so it's body-agnostic and
 * works for formData bodies as cleanly as JSON bodies.
 */

import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { applyPaidRouteGuards } from "@/lib/paid-route-guard";
import { emit } from "@/lib/audit-log";
import { estimateCost } from "@/lib/pricing";

const sha256Hex = (s: string | Uint8Array | Buffer) =>
  crypto.createHash("sha256").update(s).digest("hex");

export const maxDuration = 30;

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

// Masonic vocabulary prompt to improve recognition accuracy
const MASONIC_PROMPT = [
  "Masonic Lodge ritual ceremony.",
  "Worshipful Master, Senior Warden, Junior Warden,",
  "Senior Deacon, Junior Deacon, Tyler, Tiler, Secretary, Treasurer.",
  "Cowans and eavesdroppers. Duly tiled.",
  "So mote it be. Holy Saints John at Jerusalem.",
  "Plumb, square, compasses, gavel, trestle board.",
  "Entered Apprentice, Fellow Craft, Master Mason.",
  "Obligation, due guard, sign, token, grip.",
  "Meridian height. Profane. Brethren.",
  "Lodge assembled. Purgation. Colloquy.",
].join(" ");

export async function POST(req: NextRequest) {
  // SAFETY-03: kill-switch + client-token + rate-limit gate BEFORE any
  // body access. formData is still available after because the guard
  // never touches req.body.
  const guard = await applyPaidRouteGuards(req, { routeName: "transcribe" });
  if (guard.kind === "deny") return guard.response;
  const { hashedUser } = guard;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GROQ_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return Response.json(
        { error: "No audio file provided." },
        { status: 400 }
      );
    }

    // Input size cap on paid Groq Whisper endpoint (CSO Finding 4).
    // 1 MB ≈ 60s of compressed speech — well above any single ritual line.
    const MAX_AUDIO_BYTES = 1024 * 1024;
    if (audioFile.size > MAX_AUDIO_BYTES) {
      return Response.json(
        { error: `audio exceeds ${MAX_AUDIO_BYTES} byte limit (got ${audioFile.size})` },
        { status: 413 }
      );
    }

    // Forward to Groq Whisper API
    const groqForm = new FormData();
    groqForm.append("file", audioFile, "recording.webm");
    groqForm.append("model", "whisper-large-v3");
    groqForm.append("language", "en");
    groqForm.append("prompt", MASONIC_PROMPT);
    groqForm.append("response_format", "json");
    groqForm.append("temperature", "0.0");

    const t0 = Date.now();
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: groqForm,
    });
    const latencyMs = Date.now() - t0;

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq Whisper API error:", response.status, errorText);
      return Response.json(
        { error: `Transcription failed: ${response.statusText}` },
        { status: response.status }
      );
    }

    const result = (await response.json()) as { text?: string };
    const transcript = result.text || "";

    // SAFETY-03: emit audit record on successful transcription.
    // durationMs estimate: Groq bills a 10-second minimum per request
    // (PRICING_TABLE groq-whisper-large-v3 notes). We approximate
    // encoded-audio duration from the blob byteLength at ~16 kB/s
    // (typical webm/opus bitrate) and clamp to 10 000 ms minimum.
    const estimatedRawDurationMs = Math.round((audioFile.size / 16_000) * 1000);
    const durationMs = Math.max(estimatedRawDurationMs, 10_000);
    const estimatedCostUSD = estimateCost(
      "groq-whisper-large-v3",
      durationMs / 60_000,
      "per-audio-minute",
    );
    emit({
      kind: "stt",
      timestamp: new Date().toISOString(),
      hashedUser,
      route: "/api/transcribe",
      // promptHash: hash of the audio byte count (a scalar, not the audio
      // content) — never the audio bytes themselves.
      promptHash: sha256Hex(String(audioFile.size)),
      // completionHash: hash of the transcript text (never the text
      // itself; see AuditRecord type exclusion of `text`).
      completionHash: sha256Hex(transcript),
      estimatedCostUSD,
      latencyMs,
      model: "groq-whisper-large-v3",
      durationMs,
      audioByteCount: audioFile.size,
    });

    return Response.json({ transcript });
  } catch (error) {
    console.error("Transcribe route error:", error);
    return Response.json(
      { error: "Failed to process audio." },
      { status: 500 }
    );
  }
}
