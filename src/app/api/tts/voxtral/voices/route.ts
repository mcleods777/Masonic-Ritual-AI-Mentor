import { NextRequest, NextResponse } from "next/server";

/**
 * Manage Voxtral voice profiles via the Mistral Voices API.
 *
 * GET  — list saved voices (returns array of {id, name, gender, languages})
 * POST — create a new voice from a base64-encoded audio sample
 */

const MISTRAL_VOICES_URL = "https://api.mistral.ai/v1/audio/voices";

function getApiKey(): string | undefined {
  return process.env.MISTRAL_API_KEY;
}

/** List all saved Voxtral voice profiles. */
export async function GET() {
  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Mistral API key not configured" },
      { status: 500 }
    );
  }

  const response = await fetch(`${MISTRAL_VOICES_URL}?limit=50`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json(
      { error: `Mistral Voices API error: ${errText}` },
      { status: response.status }
    );
  }

  const data = (await response.json()) as {
    data?: Array<{
      id: string;
      name: string;
      gender?: string;
      languages?: string[];
    }>;
  };

  return NextResponse.json({ voices: data.data || [] });
}

/** Create a new Voxtral voice profile from an audio sample. */
export async function POST(request: NextRequest) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Mistral API key not configured" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { name, sampleAudio, sampleFilename, gender, languages } = body as {
    name?: string;
    sampleAudio?: string;
    sampleFilename?: string;
    gender?: string;
    languages?: string[];
  };

  if (!name || !sampleAudio) {
    return NextResponse.json(
      { error: "name and sampleAudio (base64) are required" },
      { status: 400 }
    );
  }

  const response = await fetch(MISTRAL_VOICES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      sample_audio: sampleAudio,
      sample_filename: sampleFilename || "sample.mp3",
      gender: gender || "male",
      languages: languages || ["en"],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json(
      { error: `Failed to create voice: ${errText}` },
      { status: response.status }
    );
  }

  const voice = (await response.json()) as {
    id: string;
    name: string;
    gender?: string;
    languages?: string[];
  };

  return NextResponse.json({ voice });
}
