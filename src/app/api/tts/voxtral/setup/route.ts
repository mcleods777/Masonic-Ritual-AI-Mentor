import { NextResponse } from "next/server";

/**
 * One-time Voxtral voice setup.
 *
 * POST /api/tts/voxtral/setup
 *
 * Bootstraps Voxtral voice profiles by generating short audio clips from
 * ElevenLabs (which has 10 distinct male voices already configured) and
 * uploading them to Mistral's Voices API. This gives Voxtral the same
 * voice differentiation as ElevenLabs at half the cost.
 *
 * Idempotent — skips voices that already exist (by name match).
 */

/** The 10 distinct ElevenLabs voices used for Masonic officers. */
const VOICE_CONFIGS = [
  { name: "masonic-wm",        elevenLabsId: "pNInz6obpgDQGcFmaJgB", description: "Adam — dominant, firm (Worshipful Master)" },
  { name: "masonic-sw",        elevenLabsId: "nPczCjzI2devNBz1zQrb", description: "Brian — deep, resonant (Senior Warden)" },
  { name: "masonic-jw",        elevenLabsId: "JBFqnCBsd6RMkjVDRZzb", description: "George — warm, British (Junior Warden)" },
  { name: "masonic-sd",        elevenLabsId: "cjVigY5qzO86Huf0OWal", description: "Eric — smooth, trustworthy (Senior Deacon)" },
  { name: "masonic-jd",        elevenLabsId: "iP95p4xoKVk53GoZ742B", description: "Chris — charming (Junior Deacon)" },
  { name: "masonic-secretary",  elevenLabsId: "pqHfZKP75CvOlQylNhV4", description: "Bill — wise, mature (Secretary)" },
  { name: "masonic-chaplain",   elevenLabsId: "onwK4e9ZLuTAKqWW03F9", description: "Daniel — steady (Chaplain)" },
  { name: "masonic-treasurer",  elevenLabsId: "IKne3meq5aSn9XLyUdCD", description: "Charlie — deep, confident (Treasurer)" },
  { name: "masonic-marshal",    elevenLabsId: "TX3LPaxmHKxFdv7VOQHJ", description: "Liam — energetic (Marshal/Tyler)" },
  { name: "masonic-candidate",  elevenLabsId: "N2lVS1w4EtoT3dr4eOWO", description: "Callum — husky (Candidate/Brother)" },
];

/** Short phrases for each voice sample — keeps it natural and distinct. */
const SAMPLE_PHRASES = [
  "Brethren, the lodge is now open for the transaction of business.",
  "Worshipful Master, the lodge is tyled.",
  "The Junior Warden's station is in the south.",
  "Worshipful Master, the Senior Deacon attends.",
  "The Junior Deacon's place is at the inner door.",
  "The minutes of the previous communication are as follows.",
  "Let us offer our prayers to the Most High.",
  "The funds of the lodge are in good order.",
  "The brethren will please be seated.",
  "I vouch for this brother, that he is worthy.",
];

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
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;

  if (!mistralKey) {
    return NextResponse.json(
      { error: "MISTRAL_API_KEY not configured" },
      { status: 500 }
    );
  }

  if (!elevenLabsKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY required for voice bootstrapping" },
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
    error?: string;
  }> = [];

  for (let i = 0; i < VOICE_CONFIGS.length; i++) {
    const config = VOICE_CONFIGS[i];

    // Skip if voice already exists
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
      // Generate audio sample from ElevenLabs
      const audioBuffer = await generateElevenLabsSample(
        config.elevenLabsId,
        SAMPLE_PHRASES[i],
        elevenLabsKey
      );

      // Create Mistral voice profile from the sample
      const voice = await createMistralVoice(
        config.name,
        audioBuffer,
        mistralKey
      );

      results.push({
        name: config.name,
        status: "created",
        voiceId: voice.id,
      });
    } catch (err) {
      results.push({
        name: config.name,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
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
