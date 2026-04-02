import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy route for Mistral Voxtral text-to-speech API.
 * Keeps the API key server-side while returning audio to the client.
 *
 * Uses streaming mode with PCM format for lowest latency (~0.7s
 * time-to-first-audio vs ~3s for non-streaming mp3).
 *
 * Accepts either:
 * - voiceId: UUID of a saved voice profile (requires Mistral paid plan)
 * - refAudio: base64-encoded wav audio for zero-shot voice cloning (free tier)
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
      { error: `Voxtral API error: ${errText}` },
      { status: response.status }
    );
  }

  // Streaming mode: Mistral sends SSE events with base64 audio chunks.
  // We decode them and stream raw audio bytes to the client.
  const reader = response.body?.getReader();
  if (!reader) {
    return NextResponse.json(
      { error: "No response body from Voxtral" },
      { status: 500 }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE events (separated by double newlines)
          const events = buffer.split("\n\n");
          // Keep the last partial event in the buffer
          buffer = events.pop() || "";

          for (const event of events) {
            // Parse SSE: look for "data: " lines
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

              // Extract audio_data from various possible response shapes
              const audioData =
                parsed.choices?.[0]?.delta?.audio_data ||
                parsed.data?.audio_data ||
                parsed.audio_data;

              if (audioData) {
                const audioBytes = Buffer.from(audioData, "base64");
                controller.enqueue(audioBytes);
              }
            } catch {
              // Skip malformed JSON chunks
            }
          }
        }
      } catch (err) {
        console.error("Voxtral stream error:", err);
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
