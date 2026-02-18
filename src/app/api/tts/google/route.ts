import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy route for Google Cloud Text-to-Speech API.
 * Keeps the API key server-side while returning audio to the client.
 */
export async function POST(request: NextRequest) {
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

  // Derive language code from voice name prefix (e.g. "en-GB-Neural2-B" → "en-GB")
  const derivedLang = voiceName.match(/^[a-z]{2}-[A-Z]{2}/)?.[0] ?? languageCode;

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

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json(
      { error: `Google Cloud TTS error: ${errText}` },
      { status: response.status }
    );
  }

  const data = (await response.json()) as { audioContent: string };
  const audioBytes = Buffer.from(data.audioContent, "base64");
  return new NextResponse(audioBytes, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
