import { NextResponse } from "next/server";

/**
 * One-time Voxtral voice setup.
 *
 * POST /api/tts/voxtral/setup
 *
 * Bootstraps Voxtral voice profiles by generating short audio clips from
 * Deepgram Aura-2 (7 distinct male voices) and uploading them to Mistral's
 * Voices API. This gives Voxtral distinct officer voices at half the cost
 * of ElevenLabs.
 *
 * Falls back to ElevenLabs if Deepgram is not configured.
 * Idempotent — skips voices that already exist (by name match).
 */

/** Voice configs using Deepgram Aura-2 models for sample generation.
 *  Names match the Aura voice names so they're recognizable in both engines.
 *  Only models verified available as of 2026-04-02. */
const VOICE_CONFIGS = [
  { name: "zeus",      deepgramModel: "aura-2-zeus-en",      description: "Zeus — commanding, deep (Worshipful Master)" },
  { name: "orion",     deepgramModel: "aura-2-orion-en",     description: "Orion — clear, steady (Senior Warden)" },
  { name: "arcas",     deepgramModel: "aura-2-arcas-en",     description: "Arcas — measured (Junior Warden)" },
  { name: "orpheus",   deepgramModel: "aura-2-orpheus-en",   description: "Orpheus — warm (Senior Deacon)" },
  { name: "apollo",    deepgramModel: "aura-2-apollo-en",    description: "Apollo — bright, articulate (Junior Deacon)" },
  { name: "hermes",   deepgramModel: "aura-2-hermes-en",   description: "Hermes — smooth, resonant (Chaplain)" },
  { name: "atlas",     deepgramModel: "aura-2-atlas-en",     description: "Atlas — steady (Marshal/Tyler)" },
];

/** ElevenLabs fallback configs for additional voices (if available). */
const ELEVENLABS_EXTRA_CONFIGS = [
  { name: "masonic-secretary",  elevenLabsId: "pqHfZKP75CvOlQylNhV4", description: "Bill — wise, mature (Secretary)" },
  { name: "masonic-treasurer",  elevenLabsId: "IKne3meq5aSn9XLyUdCD", description: "Charlie — deep, confident (Treasurer)" },
  { name: "masonic-candidate",  elevenLabsId: "N2lVS1w4EtoT3dr4eOWO", description: "Callum — husky (Candidate/Brother)" },
];

/** Short phrases for each voice sample — ritual-appropriate and distinct. */
const SAMPLE_PHRASES = [
  "Brethren, the lodge is now open for the transaction of business.",
  "Worshipful Master, the lodge is tyled.",
  "The Junior Warden's station is in the south.",
  "Worshipful Master, the Senior Deacon attends.",
  "The Junior Deacon's place is at the inner door.",
  "Let us offer our prayers to the Most High.",
  "The brethren will please be seated.",
  "The minutes of the previous communication are as follows.",
  "The funds of the lodge are in good order.",
  "I vouch for this brother, that he is worthy and well qualified.",
];

async function generateDeepgramSample(
  model: string,
  text: string,
  apiKey: string
): Promise<Buffer> {
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

  if (!response.ok) {
    throw new Error(`Deepgram error for ${model}: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function generateElevenLabsSample(
  voiceId: string,
  text: string,
  apiKey: string
): Promise<Buffer> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs error for voice ${voiceId}: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function createMistralVoice(
  name: string,
  audioBuffer: Buffer,
  apiKey: string
): Promise<{ id: string; name: string }> {
  const sampleB64 = audioBuffer.toString("base64");

  const response = await fetch("https://api.mistral.ai/v1/audio/voices", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      sample_audio: sampleB64,
      sample_filename: `${name}.mp3`,
      gender: "male",
      languages: ["en"],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Mistral voice creation failed for ${name}: ${errText}`);
  }

  return response.json() as Promise<{ id: string; name: string }>;
}

async function listMistralVoices(
  apiKey: string
): Promise<Array<{ id: string; name: string }>> {
  const response = await fetch(
    "https://api.mistral.ai/v1/audio/voices?limit=50",
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );

  if (!response.ok) return [];

  const data = (await response.json()) as {
    data?: Array<{ id: string; name: string }>;
  };
  return data.data || [];
}

export async function POST() {
  const mistralKey = process.env.MISTRAL_API_KEY;
  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;

  if (!mistralKey) {
    return NextResponse.json(
      { error: "MISTRAL_API_KEY not configured" },
      { status: 500 }
    );
  }

  if (!deepgramKey && !elevenLabsKey) {
    return NextResponse.json(
      {
        error:
          "DEEPGRAM_API_KEY or ELEVENLABS_API_KEY required to generate voice samples for Voxtral setup",
      },
      { status: 500 }
    );
  }

  // Check existing voices to skip duplicates
  const existingVoices = await listMistralVoices(mistralKey);
  const existingNames = new Set(existingVoices.map((v) => v.name));

  const results: Array<{
    name: string;
    status: "created" | "exists" | "error";
    voiceId?: string;
    source?: string;
    error?: string;
  }> = [];

  // Phase 1: Create voices from Deepgram (primary)
  if (deepgramKey) {
    for (let i = 0; i < VOICE_CONFIGS.length; i++) {
      const config = VOICE_CONFIGS[i];

      if (existingNames.has(config.name)) {
        const existing = existingVoices.find((v) => v.name === config.name);
        results.push({
          name: config.name,
          status: "exists",
          voiceId: existing?.id,
        });
        continue;
      }

      try {
        const audioBuffer = await generateDeepgramSample(
          config.deepgramModel,
          SAMPLE_PHRASES[i],
          deepgramKey
        );

        const voice = await createMistralVoice(
          config.name,
          audioBuffer,
          mistralKey
        );

        results.push({
          name: config.name,
          status: "created",
          voiceId: voice.id,
          source: "deepgram",
        });
      } catch (err) {
        results.push({
          name: config.name,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Phase 2: Create extra voices from ElevenLabs (if available)
  if (elevenLabsKey) {
    for (let i = 0; i < ELEVENLABS_EXTRA_CONFIGS.length; i++) {
      const config = ELEVENLABS_EXTRA_CONFIGS[i];

      if (existingNames.has(config.name)) {
        const existing = existingVoices.find((v) => v.name === config.name);
        results.push({
          name: config.name,
          status: "exists",
          voiceId: existing?.id,
        });
        continue;
      }

      try {
        const phraseIdx = VOICE_CONFIGS.length + i;
        const audioBuffer = await generateElevenLabsSample(
          config.elevenLabsId,
          SAMPLE_PHRASES[phraseIdx] || SAMPLE_PHRASES[0],
          elevenLabsKey
        );

        const voice = await createMistralVoice(
          config.name,
          audioBuffer,
          mistralKey
        );

        results.push({
          name: config.name,
          status: "created",
          voiceId: voice.id,
          source: "elevenlabs",
        });
      } catch (err) {
        results.push({
          name: config.name,
          status: "error",
          source: "elevenlabs",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const existed = results.filter((r) => r.status === "exists").length;
  const errors = results.filter((r) => r.status === "error").length;

  return NextResponse.json({
    summary: `Created ${created}, already existed ${existed}, errors ${errors}`,
    results,
  });
}
