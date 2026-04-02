import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy route for Mistral Voxtral text-to-speech API.
 * Keeps the API key server-side while returning audio to the client.
 *
 * Accepts either:
 * - voiceId: UUID of a saved voice profile (from /api/tts/voxtral/voices)
 * - refAudio: base64-encoded audio for one-off voice cloning
 *
 * If neither is provided, uses the first available saved voice profile,
 * or returns an error asking the user to set up voices.
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

  // Build the request body — must have either voice_id or ref_audio
  const speechBody: Record<string, string> = {
    model: "voxtral-mini-tts-2603",
    input: text,
    response_format: "mp3",
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
