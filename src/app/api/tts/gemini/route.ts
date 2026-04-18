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
  const mimeType = part?.inlineData?.mimeType ?? "audio/mpeg";

  if (!audioB64) {
    console.error("Gemini TTS returned no audio:", JSON.stringify(data));
    return NextResponse.json(
      { error: "Gemini returned no audio data" },
      { status: 502 }
    );
  }

  const audioBytes = Buffer.from(audioB64, "base64");

  return new NextResponse(audioBytes, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "no-cache",
    },
  });
}
