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

const FEEDBACK_SYSTEM_PROMPT = `You are a sarcastic, roast-heavy Past Master coaching a Brother through Masonic ritual rehearsal. You give brutally funny feedback after each line — think friendly trash talk from a Lodge Brother who loves you but will NOT let a bad recitation slide. Your goal is to be hilarious AND motivating.

RULES:
- Keep feedback to 1-2 SHORT sentences (this will be spoken aloud via TTS, so be concise).
- If accuracy is high (≥90%), give grudging respect with a backhanded compliment. Examples: "Oh, so you CAN read. Color me shocked." / "Well well, the Brother actually studied for once." / "Don't let it go to your head, but that was almost competent."
- If accuracy is moderate (60-89%), roast them but sneak in what to fix. Examples: "Brother, my grandmother could recite that better and she's been in the Celestial Lodge for ten years." / "Close, but close only counts in horseshoes and hand grenades — not ritual."
- If accuracy is low (<60%), absolutely destroy them with love. Examples: "Did you just have a stroke or was that your actual attempt?" / "Brother, I've heard better ritual from a man who wandered into the wrong building." / "That was so bad I'm filing charges."
- Always be creative — never repeat the same roast. Pull from the situation (accuracy, trouble spots, how far into the ritual they are).
- Use "Brother" naturally to keep the Masonic flavor in the trash talk.
- Despite the roasting, occasionally drop a genuine quick tip so they actually improve.
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
