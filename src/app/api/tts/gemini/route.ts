import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { applyPaidRouteGuards } from "@/lib/paid-route-guard";
import { emit } from "@/lib/audit-log";
import { estimateCost } from "@/lib/pricing";

/**
 * Proxy route for Google Gemini 3.1 Flash TTS API — streaming mode.
 *
 * Uses streamGenerateContent with Server-Sent Events so Gemini starts
 * emitting PCM audio chunks as they're generated instead of buffering
 * the entire response. Total response time drops from 2-5s (batch) to
 * ~0.7-1s (streaming) for typical ritual lines, matching the Voxtral
 * route's responsiveness.
 *
 * Client sends { text, style, voice }; server concatenates the Gemini
 * audio-tag prompt "[style] text" (review decision 3A), then:
 *   1. Writes a 44-byte WAV/RIFF header upfront with an over-sized
 *      dataSize field (0x7FFFFFFE). Browsers tolerate an unknown-size
 *      WAV and play through as bytes arrive.
 *   2. Parses each SSE event, extracts the base64 PCM chunk, decodes,
 *      and streams raw PCM bytes out.
 *   3. Closes the stream on Gemini's final chunk.
 *
 * Keeps the rest of the contract identical so speakGemini() and
 * preloadGeminiRitual() continue working unchanged.
 */

import { STYLE_TAG_PATTERN } from "@/lib/styles";

const sha256Hex = (s: string | Uint8Array | Buffer) =>
  crypto.createHash("sha256").update(s).digest("hex");

// Gemini TTS preview models, tried in order on 429. Each model has its
// own daily quota bucket — when 3.1-flash hits its preview cap we can
// silently fall through to 2.5 variants. All three accept identical
// request/response shapes and the same prebuilt voice names (Alnilam,
// Charon, etc.) so the fallback is fully transparent to callers.
//
// Override via GEMINI_TTS_MODELS env var (comma-separated, in
// preferred order) to hot-swap without a deploy when Google rotates
// preview model availability.
const DEFAULT_GEMINI_MODELS = [
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
];

function getGeminiModels(): string[] {
  const env = process.env.GEMINI_TTS_MODELS?.trim();
  if (!env) return DEFAULT_GEMINI_MODELS;
  const parsed = env.split(",").map((s) => s.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_GEMINI_MODELS;
}

function geminiEndpoint(model: string): string {
  // Use streamGenerateContent + SSE — preview TTS models only expose this
  // endpoint (batch generateContent returns 404). Server-side, we buffer
  // the entire SSE stream into a complete WAV before returning to the
  // client as a single Content-Length response (NOT chunked transfer).
  // That avoids the Chromium ERR_REQUEST_RANGE_NOT_SATISFIABLE bug where
  // chunked-transfer audio blobs failed to play even with corrected WAV
  // headers. Cost is the same 2-5s as batch since we're buffering anyway.
  // Preload covers the latency for full-ritual rehearsal.
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
}

// Eng-review + CSO finding: cap input text length on paid AI endpoints.
// 2000 chars covers the longest Initiation line (the 1,401-char Obligation)
// with a safety margin. Above this, return 413.
const MAX_TEXT_CHARS = 2000;

export async function POST(request: NextRequest) {
  // SAFETY-03: kill-switch + client-token + rate-limit gate must run
  // before any upstream work (and before body parsing — the guard only
  // reads headers/cookies, never the body).
  const guard = await applyPaidRouteGuards(request, { routeName: "tts:gemini" });
  if (guard.kind === "deny") return guard.response;
  const { hashedUser } = guard;

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Gemini API key not configured" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { text, style, voice } = body as {
    text?: string;
    style?: string;
    voice?: string;
  };

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      {
        error: `text exceeds ${MAX_TEXT_CHARS} char limit (got ${text.length})`,
      },
      { status: 413 },
    );
  }

  if (style !== undefined) {
    if (typeof style !== "string" || !STYLE_TAG_PATTERN.test(style)) {
      return NextResponse.json(
        { error: "style must match STYLE_TAG_PATTERN" },
        { status: 400 },
      );
    }
  }

  const prompt = style ? `[${style}] ${text}` : text;

  const gemReq = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: voice
        ? {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          }
        : undefined,
    },
  };

  // Try each model in order. 429 (quota) → fall through to next model.
  // Any other non-2xx is a real failure: surface immediately so the client
  // fallback chain (Voxtral → browser) can take over.
  const models = getGeminiModels();
  let resp: Response | null = null;
  let servedBy: string | null = null;
  let lastQuotaError: { model: string; status: number; body: string } | null =
    null;
  const t0 = Date.now();

  for (const model of models) {
    const r = await fetch(`${geminiEndpoint(model)}&key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gemReq),
    });

    if (r.ok) {
      resp = r;
      servedBy = model;
      if (lastQuotaError) {
        console.warn(
          `Gemini TTS: ${lastQuotaError.model} quota-throttled, falling through to ${model} succeeded`,
        );
      }
      break;
    }

    // 429 = quota exhausted on this model. 404 = model name not recognized
    // by the API (Google rotates preview models silently). Both: try the
    // next model in the chain.
    if (r.status === 429 || r.status === 404) {
      lastQuotaError = {
        model,
        status: r.status,
        body: await r.text(),
      };
      console.warn(
        `Gemini TTS: ${model} returned ${r.status}, trying next model in fallback chain`,
      );
      continue;
    }

    const errText = await r.text();
    console.error(`Gemini TTS error (${r.status}) on ${model}:`, errText);
    return NextResponse.json(
      { error: `Gemini TTS error (${r.status})` },
      { status: r.status },
    );
  }

  if (!resp || !servedBy) {
    // Every model in the fallback chain returned 429.
    console.error(
      `Gemini TTS: all ${models.length} models quota-throttled. Last: ${lastQuotaError?.model} → ${lastQuotaError?.body}`,
    );
    return NextResponse.json(
      {
        error: `Gemini TTS quota exhausted across all ${models.length} fallback models`,
      },
      { status: 429 },
    );
  }

  // SSE stream: read all events server-side, accumulate PCM bytes from
  // each event's inlineData.data, then build a single complete WAV with
  // accurate dataSize and return as a normal Content-Length response.
  // No client-visible streaming. No chunked transfer.
  const reader = resp.body?.getReader();
  if (!reader) {
    return NextResponse.json(
      { error: "No response body from Gemini" },
      { status: 502 },
    );
  }

  interface GeminiChunk {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string };
        }>;
      };
    }>;
  }

  const decoder = new TextDecoder();
  let rawAccumulated = ""; // for diagnostic logging if no audio extracted
  let sseBuffer = "";
  const pcmChunks: Buffer[] = [];
  let mimeType = "audio/L16;codec=pcm;rate=24000";
  let eventsParsed = 0;
  let eventsWithCandidates = 0;
  let eventsWithInlineData = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      rawAccumulated += chunk;
      sseBuffer += chunk;

      // Try both \n\n (LF) and \r\n\r\n (CRLF) event separators. Google's
      // SSE has been seen to switch between them across model versions.
      const events = sseBuffer.split(/\r?\n\r?\n/);
      sseBuffer = events.pop() || "";

      for (const event of events) {
        eventsParsed++;
        // Match data: lines whether prefixed with single or double newline,
        // and tolerate the colon being followed by 0+ spaces.
        const dataLine = event
          .split(/\r?\n/)
          .find((l) => /^data:\s*/.test(l));
        if (!dataLine) continue;
        const jsonStr = dataLine.replace(/^data:\s*/, "").trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        try {
          const parsed = JSON.parse(jsonStr) as GeminiChunk;
          if (parsed.candidates?.length) eventsWithCandidates++;
          const part = parsed.candidates?.[0]?.content?.parts?.[0];
          const audioB64 = part?.inlineData?.data;
          if (!audioB64) continue;
          eventsWithInlineData++;
          if (part?.inlineData?.mimeType) mimeType = part.inlineData.mimeType;
          pcmChunks.push(Buffer.from(audioB64, "base64"));
        } catch {
          // Malformed SSE event — skip.
        }
      }
    }
  } catch (err) {
    console.error("Gemini TTS SSE read error:", err);
    return NextResponse.json(
      { error: "Gemini TTS stream interrupted" },
      { status: 502 },
    );
  }

  if (pcmChunks.length === 0) {
    // Diagnostic: log the first 800 chars of the raw response so we can
    // see what Google actually sent. This will appear in Vercel logs
    // when audio extraction fails — critical for diagnosing format drift.
    const sample = rawAccumulated.slice(0, 800);
    console.error(
      `Gemini TTS: ${servedBy} returned 200 but no audio. ` +
        `events=${eventsParsed} withCandidates=${eventsWithCandidates} withInlineData=${eventsWithInlineData} ` +
        `bufferRemaining=${sseBuffer.length} totalRaw=${rawAccumulated.length}. ` +
        `Sample (first 800 chars): ${sample}`,
    );
    return NextResponse.json(
      { error: "Gemini TTS returned no audio data" },
      { status: 502 },
    );
  }

  const pcm = Buffer.concat(pcmChunks);
  const sampleRate = parseSampleRate(mimeType);
  const header = buildWavHeader(sampleRate, 1, 16, pcm.length);
  const wav = Buffer.concat([Buffer.from(header), pcm]);
  const latencyMs = Date.now() - t0;

  // SAFETY-03: emit audit record on successful audio response.
  // Gemini TTS is priced per-audio-token — 25 tokens per second of audio
  // (per PRICING_TABLE + PATTERNS §16). Convert PCM bytes → seconds using
  // 16-bit (2-byte) samples at the stream's sample rate.
  const audioSeconds = pcm.length / (sampleRate * 2);
  const audioTokens = audioSeconds * 25;
  emit({
    kind: "tts",
    timestamp: new Date().toISOString(),
    hashedUser,
    route: "/api/tts/gemini",
    promptHash: sha256Hex(prompt),
    completionHash: sha256Hex(pcm),
    estimatedCostUSD: estimateCost(servedBy, audioTokens, "per-audio-token"),
    latencyMs,
    model: servedBy,
    voice: voice ?? "default",
    charCount: text.length,
  });

  return new NextResponse(new Uint8Array(wav), {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(wav.length),
      "Cache-Control": "no-cache",
      "X-Gemini-Model": servedBy,
    },
  });
}

/**
 * Parse the sample rate from a Gemini TTS MIME type like
 *   audio/L16;codec=pcm;rate=24000
 * Falls back to 24000 Hz (the Gemini 3.1 Flash TTS default) if absent.
 */
function parseSampleRate(mimeType: string): number {
  const m = /rate=(\d+)/.exec(mimeType);
  if (m) {
    const rate = parseInt(m[1], 10);
    if (Number.isFinite(rate) && rate > 0) return rate;
  }
  return 24000;
}

/**
 * Build a 44-byte RIFF/WAVE header. For streaming mode, dataSize is
 * set to a large sentinel (0x7FFFFFFE) so the header can be written
 * before the full audio length is known. Standard browsers tolerate
 * this and play through to the natural end of stream.
 *
 * https://docs.fileformat.com/audio/wav/
 */
function buildWavHeader(
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
  dataSize: number,
): Uint8Array {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4); // file size - 8
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);            // fmt chunk size (PCM = 16)
  header.writeUInt16LE(1, 20);             // format = PCM (uncompressed)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  return new Uint8Array(header);
}
