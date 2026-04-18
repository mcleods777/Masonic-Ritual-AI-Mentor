import { NextRequest, NextResponse } from "next/server";

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

const GEMINI_MODEL = "gemini-3.1-flash-tts-preview";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;

// Eng-review + CSO finding: cap input text length on paid AI endpoints.
// 2000 chars covers the longest Initiation line (the 1,401-char Obligation)
// with a safety margin. Above this, return 413.
const MAX_TEXT_CHARS = 2000;

// Largest WAV dataSize we can advertise without confusing picky players.
// 2^31 - 2 works across every browser I tested (Chrome/Firefox/Safari).
const WAV_STREAMING_DATA_SIZE = 0x7ffffffe;

export async function POST(request: NextRequest) {
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

  const resp = await fetch(`${GEMINI_ENDPOINT}&key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(gemReq),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`Gemini TTS error (${resp.status}):`, errText);
    return NextResponse.json(
      { error: `Gemini TTS error (${resp.status})` },
      { status: resp.status },
    );
  }

  const reader = resp.body?.getReader();
  if (!reader) {
    return NextResponse.json(
      { error: "No response body from Gemini" },
      { status: 502 },
    );
  }

  // Assemble WAV-over-chunked-HTTP. The WAV header is emitted once on
  // first PCM bytes seen. Sample rate is read from Gemini's mimeType
  // (typically "audio/L16;codec=pcm;rate=24000").
  const outputStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let headerWritten = false;
      let totalBytes = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });

          // SSE events are separated by double-newline
          const events = sseBuffer.split("\n\n");
          sseBuffer = events.pop() || "";

          for (const event of events) {
            const dataLine = event
              .split("\n")
              .find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            const jsonStr = dataLine.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;

            try {
              interface GeminiChunk {
                candidates?: Array<{
                  content?: {
                    parts?: Array<{
                      inlineData?: { mimeType?: string; data?: string };
                    }>;
                  };
                }>;
              }
              const parsed = JSON.parse(jsonStr) as GeminiChunk;
              const part = parsed.candidates?.[0]?.content?.parts?.[0];
              const audioB64 = part?.inlineData?.data;
              if (!audioB64) continue;

              if (!headerWritten) {
                const mimeType =
                  part?.inlineData?.mimeType ??
                  "audio/L16;codec=pcm;rate=24000";
                const sampleRate = parseSampleRate(mimeType);
                controller.enqueue(
                  buildWavHeader(sampleRate, 1, 16, WAV_STREAMING_DATA_SIZE),
                );
                headerWritten = true;
              }

              const pcm = Buffer.from(audioB64, "base64");
              totalBytes += pcm.length;
              controller.enqueue(new Uint8Array(pcm));
            } catch {
              // Malformed SSE event — skip it. If too many stack up
              // Gemini is having a bad day and we'll eventually time out.
            }
          }
        }
        // Logging inside the stream so it shows in Vercel function logs
        // when the stream completes successfully.
        if (!headerWritten) {
          console.error("Gemini TTS stream ended with no audio data");
        }
      } catch (err) {
        console.error("Gemini TTS stream error:", err);
        controller.error(err);
        return;
      } finally {
        controller.close();
      }

      // Sanity ping — helps diagnose silent streams without failing the
      // user-facing response.
      if (!totalBytes) console.warn("Gemini TTS: 0 audio bytes streamed");
    },
  });

  return new NextResponse(outputStream, {
    headers: {
      "Content-Type": "audio/wav",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
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
