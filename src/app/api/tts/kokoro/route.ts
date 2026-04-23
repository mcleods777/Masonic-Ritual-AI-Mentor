import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { applyPaidRouteGuards } from "@/lib/paid-route-guard";
import { emit } from "@/lib/audit-log";
import { estimateCost } from "@/lib/pricing";

const sha256Hex = (s: string | Uint8Array | Buffer) =>
  crypto.createHash("sha256").update(s).digest("hex");

/**
 * Proxy route for Kokoro TTS (self-hosted, free).
 * Uses the OpenAI-compatible /v1/audio/speech endpoint that
 * kokoro-fastapi and similar servers expose.
 *
 * Set KOKORO_TTS_URL to your server (defaults to http://localhost:8880).
 */
export async function POST(request: NextRequest) {
  // SAFETY-03: kill-switch + client-token + rate-limit gate.
  // Kokoro costs $0 but still consumes the user's per-hour/day budget
  // and compute time — same guard-rails apply.
  const guard = await applyPaidRouteGuards(request, {
    routeName: "tts:kokoro",
  });
  if (guard.kind === "deny") return guard.response;
  const { hashedUser } = guard;

  const baseUrl = process.env.KOKORO_TTS_URL || "http://localhost:8880";

  const body = await request.json();
  const {
    text,
    voice = "am_adam",
    speed = 1.0,
  } = body as {
    text?: string;
    voice?: string;
    speed?: number;
  };

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (typeof text === "string" && text.length > 2000) {
    return NextResponse.json({ error: `text exceeds 2000 char limit (got ${text.length})` }, { status: 413 });
  }

  const t0 = Date.now();
  const response = await fetch(`${baseUrl}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "kokoro",
      input: text,
      voice,
      speed,
      response_format: "mp3",
    }),
  });
  const latencyMs = Date.now() - t0;

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json(
      { error: `Kokoro TTS error: ${errText}` },
      { status: response.status }
    );
  }

  const audioBuffer = await response.arrayBuffer();
  const audioBytes = Buffer.from(audioBuffer);

  // SAFETY-03: emit audit record. Kokoro is self-hosted and $0 — but we
  // still log latencyMs + charCount so the audit stream has the data
  // (Vercel function time shows up separately in platform billing).
  emit({
    kind: "tts",
    timestamp: new Date().toISOString(),
    hashedUser,
    route: "/api/tts/kokoro",
    promptHash: sha256Hex(text),
    completionHash: sha256Hex(audioBytes),
    estimatedCostUSD: estimateCost("kokoro", text.length, "self-hosted"),
    latencyMs,
    model: "kokoro",
    voice,
    charCount: text.length,
  });

  return new NextResponse(audioBuffer, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
