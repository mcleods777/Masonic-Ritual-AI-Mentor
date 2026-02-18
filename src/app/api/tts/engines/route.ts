import { NextResponse } from "next/server";

/**
 * Returns which cloud TTS engines have API keys configured.
 * The client uses this to show/hide engine options in the selector.
 */
export async function GET() {
  return NextResponse.json({
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    google: !!process.env.GOOGLE_CLOUD_TTS_API_KEY,
  });
}
