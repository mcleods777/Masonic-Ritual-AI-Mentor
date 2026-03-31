import { NextResponse } from "next/server";

/**
 * Returns which cloud TTS engines have API keys configured.
 * The client uses this to show/hide engine options in the selector.
 *
 * Kokoro is self-hosted — availability is based on KOKORO_TTS_URL being set
 * (defaults to localhost:8880, so it's "available" if the env var exists or
 * the user is running it locally).
 */
export async function GET() {
  return NextResponse.json({
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    google: !!process.env.GOOGLE_CLOUD_TTS_API_KEY,
    deepgram: !!process.env.DEEPGRAM_API_KEY,
    kokoro: !!process.env.KOKORO_TTS_URL,
  });
}
