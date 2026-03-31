import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy route for Mistral Voxtral text-to-speech API.
 * Keeps the API key server-side while returning audio to the client.
 */
export async function POST(request: NextRequest) {
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
    voiceId = "casual_male",
  } = body as {
    text?: string;
    voiceId?: string;
  };

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const response = await fetch("https://api.mistral.ai/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "voxtral-mini-tts-2603",
      input: text,
      voice_id: voiceId,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json(
      { error: `Voxtral API error: ${errText}` },
      { status: response.status }
    );
  }

  // Voxtral returns JSON with base64-encoded audio
  const result = await response.json();
  const audioData = (result as { audio_data?: string }).audio_data;
  if (!audioData) {
    return NextResponse.json(
      { error: "No audio data in Voxtral response" },
      { status: 500 }
    );
  }

  const audioBuffer = Buffer.from(audioData, "base64");
  return new NextResponse(audioBuffer, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
