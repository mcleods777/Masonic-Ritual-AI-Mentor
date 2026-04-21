/**
 * Rehearsal Feedback API Route
 *
 * Generates brief, spoken AI coaching feedback after the user recites
 * a line in rehearsal mode. Uses Llama 3.3 on Groq for fast, free,
 * open-source inference. Streams the response for low latency.
 *
 * Falls back to Mistral Small if GROQ_API_KEY is not set but
 * MISTRAL_API_KEY is available.
 *
 * SAFETY-03 / SAFETY-06: guard at the top (kill-switch + client-token
 * + rate-limit) AND an additional `feedback:5min:<hashedUser>` counter
 * of 300 calls / 5 minutes per user (CONTEXT §SAFETY-06 server-side
 * belt-and-suspenders). audit-record emitted on stream completion.
 */

import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { applyPaidRouteGuards } from "@/lib/paid-route-guard";
import { emit } from "@/lib/audit-log";
import { estimateCost } from "@/lib/pricing";
import { rateLimit } from "@/lib/rate-limit";

const sha256Hex = (s: string | Uint8Array | Buffer) =>
  crypto.createHash("sha256").update(s).digest("hex");

export const maxDuration = 10;

const FEEDBACK_SYSTEM_PROMPT = `You are a wickedly sharp Past Master with decades of Lodge experience, coaching a Brother through Masonic ritual rehearsal. You have the dry wit of a seasoned comedian and the timing of a great orator. Your humor is layered — you weave in Masonic metaphors, Lodge culture references, and situational comedy. Think less "insult comic" and more "the funniest guy at the festive board who also happens to know every word of ritual."

RULES:
- Keep feedback to 1-2 SHORT sentences (spoken aloud via TTS — punchy and natural).
- If accuracy is high (≥90%), acknowledge it with wit — not just "good job" but something clever that rewards the effort. Riff on their streak, their improvement, or the specific passage. Examples: "The Grand Architect Himself couldn't find fault with that one." / "Careful Brother, keep this up and they'll actually put you in the East."
- If accuracy is moderate (60-89%), be funny but surgically specific about what went wrong. Reference the trouble spots by name when possible. Examples: "You were cruising until you hit that middle section — it's like you drove into a Masonic pothole." / "Eighty percent isn't bad, but you wouldn't build a temple with eighty percent of the stones, would you?"
- If accuracy is low (<60%), bring the heat but make it so clever they laugh instead of cringe. Use Masonic imagery in the roast. Examples: "Brother, that recitation was rougher than an Entered Apprentice's first night." / "I've seen better work from a candidate who thought the Tyler was the valet." / "That wasn't ritual, that was abstract poetry. Unfortunately we do Masonry here."
- Be endlessly creative — vary your style between dry wit, absurd analogies, Masonic wordplay, and observational humor. Never use the same joke structure twice.
- Use "Brother" naturally — sometimes for warmth, sometimes to set up the punchline.
- Weave in genuine coaching when the moment calls for it — a quick tip lands harder after a great joke.
- If they're near the end of the ritual, acknowledge the journey. If they nailed a hard section, note it.
- If performance history is provided, USE IT intelligently: reference their streak, celebrate improvements, call out recurring trouble spots, or note when they finally nail something they've been struggling with. Make the feedback feel personal and aware of their journey.
- NEVER quote or reveal the full ritual text.
- NEVER reveal grips, passwords, signs, or modes of recognition.
- Do NOT use markdown, bullet points, or formatting — spoken text only.`;

/** Map the active provider to a PRICING_TABLE model id (input/output split). */
function providerPricingKeys(model: string): {
  inputKey: string;
  outputKey: string;
} {
  if (model.startsWith("mistral-")) {
    return {
      inputKey: "mistral-small-latest-input",
      outputKey: "mistral-small-latest-output",
    };
  }
  // Default to Groq Llama (both the primary model and the env override
  // settle into this bucket — the PRICING_TABLE splits in/out rates).
  return {
    inputKey: "groq-llama-3.3-70b-versatile-input",
    outputKey: "groq-llama-3.3-70b-versatile-output",
  };
}

/** Rough token estimate from character count (~4 chars/token for English). */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Provider config resolved from available API keys. */
function getProvider(): {
  url: string;
  apiKey: string;
  model: string;
  authHeader: string;
} | null {
  // Prefer Groq (free, fast, open-source models)
  if (process.env.GROQ_API_KEY) {
    return {
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.FEEDBACK_MODEL || "llama-3.3-70b-versatile",
      authHeader: `Bearer ${process.env.GROQ_API_KEY}`,
    };
  }

  // Fallback to Mistral
  if (process.env.MISTRAL_API_KEY) {
    return {
      url: "https://api.mistral.ai/v1/chat/completions",
      apiKey: process.env.MISTRAL_API_KEY,
      model: process.env.FEEDBACK_MODEL || "mistral-small-latest",
      authHeader: `Bearer ${process.env.MISTRAL_API_KEY}`,
    };
  }

  return null;
}

export async function POST(req: NextRequest) {
  // SAFETY-03: kill-switch + client-token + rate-limit gate (BEFORE
  // body parsing — guard only reads headers/Bearer).
  const guard = await applyPaidRouteGuards(req, { routeName: "feedback" });
  if (guard.kind === "deny") return guard.response;
  const { hashedUser } = guard;

  // SAFETY-06 server-side burst counter: per CONTEXT §SAFETY-06, 300
  // calls / 5 minutes per hashed-user. Distinct 429 body shape so the
  // client can tell burst-limit apart from the generic hour/day cap.
  const burst = rateLimit(`feedback:5min:${hashedUser}`, 300, 5 * 60 * 1000);
  if (!burst.allowed) {
    return Response.json(
      { error: "feedback_burst" },
      {
        status: 429,
        headers: { "Retry-After": String(burst.retryAfterSeconds) },
      },
    );
  }

  const provider = getProvider();
  if (!provider) {
    return Response.json(
      { error: "No LLM API key configured (set GROQ_API_KEY or MISTRAL_API_KEY)" },
      { status: 500 }
    );
  }

  try {
    const {
      accuracy,
      wrongWords,
      missingWords,
      troubleSpots,
      lineNumber,
      totalLines,
      performanceContext,
      variantId: bodyVariantId,
    } = (await req.json()) as {
      accuracy?: number;
      wrongWords?: number;
      missingWords?: number;
      troubleSpots?: string[];
      lineNumber?: number;
      totalLines?: number;
      performanceContext?: string;
      variantId?: string;
    };

    // Input size cap on paid LLM endpoint (CSO Finding 4). The context
    // field is the only user-controlled free-text — cap it here.
    if (typeof performanceContext === "string" && performanceContext.length > 4000) {
      return Response.json(
        { error: `performanceContext exceeds 4000 char limit (got ${performanceContext.length})` },
        { status: 413 }
      );
    }

    const userPrompt = [
      `The Brother just recited line ${lineNumber} of ${totalLines}.`,
      `Accuracy: ${accuracy}%`,
      wrongWords && wrongWords > 0 ? `Wrong words: ${wrongWords}` : null,
      missingWords && missingWords > 0 ? `Missing words: ${missingWords}` : null,
      troubleSpots && troubleSpots.length > 0
        ? `Trouble spots: ${troubleSpots.slice(0, 5).join(", ")}`
        : null,
      performanceContext
        ? `\nPerformance history context:\n${performanceContext}`
        : null,
      `Give brief spoken feedback.`,
    ]
      .filter(Boolean)
      .join(". ");

    // Stream from Groq/Mistral OpenAI-compatible endpoint
    const t0 = Date.now();
    const response = await fetch(provider.url, {
      method: "POST",
      headers: {
        Authorization: provider.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: FEEDBACK_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 100,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`Feedback LLM error (${response.status}):`, errBody);
      return Response.json(
        { error: `AI feedback unavailable (${response.status})` },
        { status: 502 }
      );
    }

    // Transform SSE stream → plain text stream for the client.
    // Accumulate the full completion text server-side so we can emit
    // an audit record when the stream closes.
    const reader = response.body?.getReader();
    if (!reader) {
      return Response.json(
        { error: "No response body from LLM" },
        { status: 500 }
      );
    }

    const variantId = bodyVariantId ?? "mentor-v1";
    const promptForHash = `${FEEDBACK_SYSTEM_PROMPT}\n\n${userPrompt}`;
    const promptTokens = estimateTokens(promptForHash);

    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder();
        let buffer = "";
        let completionText = "";

        let malformed = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data) as {
                  choices?: Array<{
                    delta?: { content?: string };
                  }>;
                };
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(new TextEncoder().encode(content));
                  completionText += content;
                  malformed = 0;
                }
              } catch {
                malformed++;
                if (malformed > 5) {
                  console.error("Too many malformed SSE chunks from LLM");
                  break;
                }
              }
            }
          }
        } catch (err) {
          console.error("Feedback stream error:", err);
        } finally {
          controller.close();
          // SAFETY-03: emit audit record on stream completion. We emit
          // regardless of partial-content errors — the upstream call
          // was successful (we already checked response.ok), so the
          // spend happened even if the client-facing stream stuttered.
          const latencyMs = Date.now() - t0;
          const completionTokens = estimateTokens(completionText);
          const { inputKey, outputKey } = providerPricingKeys(provider.model);
          const inputCost = estimateCost(
            inputKey,
            promptTokens,
            "per-input-token",
          );
          const outputCost = estimateCost(
            outputKey,
            completionTokens,
            "per-output-token",
          );
          emit({
            kind: "feedback",
            timestamp: new Date().toISOString(),
            hashedUser,
            route: "/api/rehearsal-feedback",
            promptHash: sha256Hex(promptForHash),
            completionHash: sha256Hex(completionText),
            estimatedCostUSD: inputCost + outputCost,
            latencyMs,
            variantId,
            promptTokens,
            completionTokens,
          });
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("Rehearsal feedback error:", err);
    return Response.json(
      { feedback: null, error: "Failed to generate feedback" },
      { status: 500 }
    );
  }
}
