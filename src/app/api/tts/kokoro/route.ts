import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy route for Kokoro TTS (self-hosted, free).
 * Uses the OpenAI-compatible /v1/audio/speech endpoint that
 * kokoro-fastapi and similar servers expose.
 *
 * Set KOKORO_TTS_URL to your server (defaults to http://localhost:8880).
 */
export async function POST(request: NextRequest) {
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

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json(
      { error: `Kokoro TTS error: ${errText}` },
      { status: response.status }
    );
  }

  const audioBuffer = await response.arrayBuffer();
  return new NextResponse(audioBuffer, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
