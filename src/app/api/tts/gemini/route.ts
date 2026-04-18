import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy route for Google Gemini 3.1 Flash TTS API.
 *
 * Keeps the API key server-side while returning audio to the client.
 *
 * The key feature this unlocks: expressive, tag-directed delivery via
 * Gemini's "audio tag" system. The client sends { text, style, voice }
 * and this route composes the bracket-wrapped prompt the Gemini API
 * expects: `[style] text`.
 *
 * Example prompt to Gemini:
 *   [gravely] You will say I, your name, and repeat after me...
 *
 * Per eng-review decision 3A: server-side concatenation is the single
 * source of truth. The client-side cache keys hash the pre-concat
 * inputs separately so cache hits are consistent.
 *
 * Per eng-review decision 11A: streaming is on the roadmap (match Voxtral
 * PCM pattern). This first implementation uses non-streaming generateContent
 * to keep the integration contract minimal. Streaming upgrade can swap to
 * streamGenerateContent without changing the client-facing contract.
 */

import { STYLE_TAG_PATTERN } from "@/lib/styles";

const GEMINI_MODEL = "gemini-3.1-flash-tts-preview";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Eng-review + CSO finding: cap input text length on paid AI endpoints.
// 2000 chars covers the longest Initiation line (the 1,401-char Obligation)
// with a safety margin. Above this, return 413.
const MAX_TEXT_CHARS = 2000;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Gemini API key not configured" },
      { status: 500 }
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
      { status: 413 }
    );
  }

  // Validate style tag if present (prevents malformed prompts reaching Gemini)
  if (style !== undefined) {
    if (typeof style !== "string" || !STYLE_TAG_PATTERN.test(style)) {
      return NextResponse.json(
        { error: "style must match STYLE_TAG_PATTERN" },
        { status: 400 }
      );
    }
  }

  // Server-side concatenation: [style] text → Gemini's audio-tag format
  const prompt = style ? `[${style}] ${text}` : text;

  // Gemini generateContent request shape. The model returns audio data
  // as base64 inline_data on the response part.
  const gemReq = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
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

  const resp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(gemReq),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`Gemini TTS error (${resp.status}):`, errText);
    return NextResponse.json(
      { error: `Gemini TTS error (${resp.status})` },
      { status: resp.status }
    );
  }

  interface GeminiResponse {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: {
            mimeType?: string;
            data?: string;
          };
        }>;
      };
    }>;
  }

  const data = (await resp.json()) as GeminiResponse;
  const part = data.candidates?.[0]?.content?.parts?.[0];
  const audioB64 = part?.inlineData?.data;
  const mimeType = part?.inlineData?.mimeType ?? "audio/L16;codec=pcm;rate=24000";

  if (!audioB64) {
    console.error("Gemini TTS returned no audio:", JSON.stringify(data));
    return NextResponse.json(
      { error: "Gemini returned no audio data" },
      { status: 502 }
    );
  }

  const pcmBytes = Buffer.from(audioB64, "base64");

  // Gemini TTS returns raw PCM (typically L16 mono @ 24000 Hz) with a MIME
  // like "audio/L16;codec=pcm;rate=24000". The browser's <audio> element
  // can't play raw PCM directly — without a container, it either refuses
  // or interprets the bytes at some default sample rate, producing the
  // "robotic" playback seen in the initial integration.
  //
  // Fix: wrap the PCM in a minimal 44-byte WAV/RIFF header and return as
  // audio/wav. The <audio> element plays WAV natively in every browser.
  const sampleRate = parseSampleRate(mimeType);
  const wavBytes = wrapPcmInWav(pcmBytes, sampleRate, 1, 16);

  return new NextResponse(new Uint8Array(wavBytes), {
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-cache",
    },
  });
}

/**
 * Parse the sample rate from a Gemini TTS response MIME like
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
 * Prepend a 44-byte RIFF/WAVE header to raw PCM bytes so a standard
 * <audio> element can play the result. Little-endian throughout.
 *
 * https://docs.fileformat.com/audio/wav/
 */
function wrapPcmInWav(
  pcm: Buffer,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.length;
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

  return Buffer.concat([header, pcm]);
}
