import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy route for Deepgram Aura-2 text-to-speech API.
 * Keeps the API key server-side while returning audio to the client.
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Deepgram API key not configured" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const {
    text,
    model = "aura-2-orion-en",
  } = body as {
    text?: string;
    model?: string;
  };

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (typeof text === "string" && text.length > 2000) {
    return NextResponse.json({ error: `text exceeds 2000 char limit (got ${text.length})` }, { status: 413 });
  }
  
  const MAX_RETRIES = 2;
  const RETRY_DELAYS = [500, 1500];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(
      `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=mp3`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      }
    );

    if (response.ok) {
      // Stream the audio back instead of buffering the full response
      return new NextResponse(response.body, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Transfer-Encoding": "chunked",
        },
      });
    }

    // Retry on transient errors (429 rate limit, 500/503 server errors)
    const isRetryable = response.status === 429 || response.status >= 500;
    if (isRetryable && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      continue;
    }

    const errText = await response.text();
    return NextResponse.json(
      { error: `Deepgram API error: ${errText}` },
      { status: response.status }
    );
  }
}
