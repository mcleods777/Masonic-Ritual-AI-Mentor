/**
 * Rehearsal Feedback API Route
 *
 * Generates brief, spoken AI coaching feedback after the user recites
 * a line in rehearsal mode. Uses Haiku for speed — responses should
 * arrive in under a second so the TTS can start quickly.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

export const maxDuration = 15;

const FEEDBACK_SYSTEM_PROMPT = `You are a warm, encouraging Past Master coaching a Brother through Masonic ritual rehearsal. After each line the Brother recites, you give brief spoken feedback.

RULES:
- Keep feedback to 1-2 SHORT sentences (this will be spoken aloud via TTS, so be concise).
- Always lead with encouragement — even if accuracy is low, acknowledge the effort.
- If accuracy is high (≥90%), give brief praise and keep the momentum going. Examples: "Well done, Brother." / "That's the way." / "Excellent recall."
- If accuracy is moderate (60-89%), briefly note what to focus on without being discouraging.
- If accuracy is low (<60%), be kind and offer a practical tip (e.g. "Try focusing on the first few words of the passage").
- Vary your responses — don't repeat the same phrase every time. Be natural and conversational.
- Use "Brother" naturally but not in every response.
- NEVER quote or reveal the full ritual text.
- NEVER reveal grips, passwords, signs, or modes of recognition.
- Do NOT use markdown, bullet points, or formatting — this is spoken text only.`;

export async function POST(req: Request) {
  try {
    const { accuracy, wrongWords, missingWords, troubleSpots, lineNumber, totalLines } =
      await req.json();

    const userPrompt = [
      `The Brother just recited line ${lineNumber} of ${totalLines}.`,
      `Accuracy: ${accuracy}%`,
      wrongWords > 0 ? `Wrong words: ${wrongWords}` : null,
      missingWords > 0 ? `Missing words: ${missingWords}` : null,
      troubleSpots?.length > 0
        ? `Trouble spots: ${troubleSpots.slice(0, 5).join(", ")}`
        : null,
      `Give brief spoken feedback.`,
    ]
      .filter(Boolean)
      .join(". ");

    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: FEEDBACK_SYSTEM_PROMPT,
      prompt: userPrompt,
      temperature: 0.7,
      maxOutputTokens: 150,
    });

    return Response.json({ feedback: result.text });
  } catch (err) {
    console.error("Rehearsal feedback error:", err);
    return Response.json(
      { feedback: null, error: "Failed to generate feedback" },
      { status: 500 }
    );
  }
}
