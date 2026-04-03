import { NextResponse } from "next/server";

/**
 * POST /api/tts/voxtral/clone-aura
 *
 * Generates audio samples from each Deepgram Aura-2 voice and returns them
 * as base64-encoded audio. The client saves these to IndexedDB as local
 * voice profiles for Voxtral's free-tier ref_audio cloning.
 *
 * No Mistral paid plan needed — voices are stored locally, not on Mistral.
 */

const VOICE_CONFIGS = [
  { name: "zeus",      model: "aura-2-zeus-en",      role: "WM",      description: "Zeus — commanding, deep" },
  { name: "orion",     model: "aura-2-orion-en",     role: "SW",      description: "Orion — clear, steady" },
  { name: "arcas",     model: "aura-2-arcas-en",     role: "JW",      description: "Arcas — measured" },
  { name: "orpheus",   model: "aura-2-orpheus-en",   role: "SD",      description: "Orpheus — warm" },
  { name: "theia",     model: "aura-2-theia-en",     role: "JD",      description: "Theia — bright" },
  { name: "andromeda", model: "aura-2-andromeda-en", role: "Ch",      description: "Andromeda — resonant" },
  { name: "atlas",     model: "aura-2-atlas-en",     role: "T",       description: "Atlas — steady" },
];

const SAMPLE_PHRASES = [
  "Brethren, the lodge is now open for the transaction of business.",
  "Worshipful Master, the lodge is tyled.",
  "The Junior Warden's station is in the south.",
  "Worshipful Master, the Senior Deacon attends.",
  "The Junior Deacon's place is at the inner door.",
  "Let us offer our prayers to the Most High.",
  "The brethren will please be seated.",
];

export async function POST() {
  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramKey) {
    return NextResponse.json(
      { error: "DEEPGRAM_API_KEY not configured" },
      { status: 500 }
    );
  }

  const results: Array<{
    name: string;
    role: string;
    description: string;
    audioBase64: string;
    mimeType: string;
    status: "ok" | "error";
    error?: string;
  }> = [];

  for (let i = 0; i < VOICE_CONFIGS.length; i++) {
    const config = VOICE_CONFIGS[i];
    try {
      const response = await fetch(
        `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(config.model)}&encoding=mp3`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${deepgramKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: SAMPLE_PHRASES[i] }),
        }
      );

      if (!response.ok) {
        results.push({
          name: config.name,
          role: config.role,
          description: config.description,
          audioBase64: "",
          mimeType: "",
          status: "error",
          error: `Deepgram ${response.status}`,
        });
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      results.push({
        name: config.name,
        role: config.role,
        description: config.description,
        audioBase64: buffer.toString("base64"),
        mimeType: "audio/mpeg",
        status: "ok",
      });
    } catch (err) {
      results.push({
        name: config.name,
        role: config.role,
        description: config.description,
        audioBase64: "",
        mimeType: "",
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const ok = results.filter((r) => r.status === "ok").length;
  const errors = results.filter((r) => r.status === "error").length;

  return NextResponse.json({
    summary: `Generated ${ok} voice samples, ${errors} errors`,
    voices: results,
  });
}
