/**
 * Rehearsal Feedback API Route
 *
 * Generates brief, spoken AI coaching feedback after the user recites
 * a line in rehearsal mode. Uses Llama 3.3 on Groq for fast, free,
 * open-source inference. Streams the response for low latency.
 *
 * Falls back to Mistral Small if GROQ_API_KEY is not set but
 * MISTRAL_API_KEY is available.
 */

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

export async function POST(req: Request) {
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
    } = await req.json();

    const userPrompt = [
      `The Brother just recited line ${lineNumber} of ${totalLines}.`,
      `Accuracy: ${accuracy}%`,
      wrongWords > 0 ? `Wrong words: ${wrongWords}` : null,
      missingWords > 0 ? `Missing words: ${missingWords}` : null,
      troubleSpots?.length > 0
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
      const errText = await response.text();
      console.error(`Feedback LLM error (${response.status}):`, errText);
      return Response.json(
        { error: `LLM API error: ${response.status}` },
        { status: response.status }
      );
    }

    // Transform SSE stream → plain text stream for the client
    const reader = response.body?.getReader();
    if (!reader) {
      return Response.json(
        { error: "No response body from LLM" },
        { status: 500 }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder();
        let buffer = "";

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
                }
              } catch {
                // Skip malformed chunks
              }
            }
          }
        } catch (err) {
          console.error("Feedback stream error:", err);
        } finally {
          controller.close();
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
