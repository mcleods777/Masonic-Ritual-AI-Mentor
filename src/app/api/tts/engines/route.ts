import { NextRequest, NextResponse } from "next/server";
import { applyPaidRouteGuards } from "@/lib/paid-route-guard";

/**
 * Returns which cloud TTS engines have API keys configured.
 * The client uses this to show/hide engine options in the selector.
 *
 * Kokoro is self-hosted — availability is based on KOKORO_TTS_URL being set
 * (defaults to localhost:8880, so it's "available" if the env var exists or
 * the user is running it locally).
 *
 * SAFETY-03: this is a dispatcher / metadata endpoint — it reads env-var
 * presence and returns booleans; it does NOT call any upstream provider
 * itself. The 6 specific-engine routes (gemini, elevenlabs, google,
 * deepgram, kokoro, voxtral) each emit their own audit records when
 * called. The guard still applies here so the kill-switch + client-token
 * + rate-limit buckets cover this route (per acceptance criterion
 * "all 7 TTS route files contain applyPaidRouteGuards"); we do NOT emit
 * an AuditRecord because no upstream spend was incurred.
 */
export async function GET(request: NextRequest) {
  const guard = await applyPaidRouteGuards(request, {
    routeName: "tts:engines",
  });
  if (guard.kind === "deny") return guard.response;

  return NextResponse.json({
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    google: !!process.env.GOOGLE_CLOUD_TTS_API_KEY,
    deepgram: !!process.env.DEEPGRAM_API_KEY,
    kokoro: !!process.env.KOKORO_TTS_URL,
    voxtral: !!process.env.MISTRAL_API_KEY,
    gemini: !!process.env.GOOGLE_GEMINI_API_KEY,
  });
}
