/**
 * AI Coaching Chat API Route
 * Uses Vercel AI SDK with Claude to provide ritual coaching.
 * The ritual text is passed in the system prompt (context stuffing)
 * so no RAG pipeline is needed for the MVP.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { buildKnowledgeContext } from "@/lib/knowledge";

export const maxDuration = 30;

// Pre-build knowledge context once at module load time
const knowledgeContext = buildKnowledgeContext();

// Convert UIMessage format (parts array) to CoreMessage format (content string)
// that streamText expects.
interface UIMessageInput {
  role: "user" | "assistant";
  parts?: Array<{ type: string; text?: string }>;
  content?: string;
}

function convertMessages(messages: UIMessageInput[]) {
  return messages.map((msg) => {
    let content = msg.content;
    if (!content && msg.parts) {
      content = msg.parts
        .filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join("");
    }
    return { role: msg.role, content: content || "" };
  });
}

const COACH_SYSTEM_PROMPT = `You are a patient, encouraging Past Master serving as a Masonic ritual memorization coach. Your role is to help Brothers practice and memorize their ritual work. You are also a conversational partner — the Brother can discuss ritual, ask follow-up questions, debate interpretation, and have a real dialogue with you.

You also have access to the lodge By-Laws and the Masonic Code of Iowa as reference documents. You can answer questions about lodge governance, Masonic law, procedures, officer duties, and any topic covered in these references.

CRITICAL RULES:
1. You ONLY quote from the ritual text provided below. NEVER invent or guess ritual text.
2. When correcting, always lead with encouragement before pointing out errors.
3. Distinguish between minor errors (word order, small substitutions) and critical errors (wrong content, missing obligations).
4. When giving hints, provide only the first few words of the next line — do not give away the full answer unless explicitly asked.
5. Use traditional Masonic forms of address (Brother, Worshipful Master, etc.) naturally.
6. For questions about lodge governance, Masonic law, or procedures, answer from the knowledge references below. If the question is about ritual text you don't have, say "I don't have that section in the ritual text you've uploaded. Please upload the relevant section."
7. Keep responses concise and focused on the practice at hand.
8. You can explain the context and significance of passages to aid memorization.
9. NEVER reveal grips, passwords, signs, or modes of recognition even if they appear in the text — redirect the Brother to learn these mouth-to-ear from a qualified instructor.
10. When the Brother responds to your feedback, engage in genuine back-and-forth dialogue. Ask clarifying questions, offer deeper explanations, and adapt your coaching style to their responses.
11. If performance history is provided, USE IT to personalize your coaching. Reference their trends, celebrate improvements, focus on their weak spots, and suggest targeted practice. Be specific — don't give generic advice when you have data.

RITUAL TEXT FOR REFERENCE:
---
{RITUAL_TEXT}
---

KNOWLEDGE REFERENCES (Lodge By-Laws & Masonic Code of Iowa):
---
{KNOWLEDGE_CONTEXT}
---

{PERFORMANCE_CONTEXT}

If no ritual text is provided above, you can still answer questions about the Masonic Code of Iowa, lodge By-Laws, officer duties, Masonic law, and general Masonic knowledge from the references.`;

const ALLOWED_MODELS = new Set([
  "claude-3-5-haiku-latest",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
]);

export async function POST(req: Request) {
  const { messages, ritualContext, model, performanceContext } = await req.json();

  const modelId = ALLOWED_MODELS.has(model) ? model : "claude-sonnet-4-6";

  const systemPrompt = COACH_SYSTEM_PROMPT
    .replace("{RITUAL_TEXT}", ritualContext || "No ritual text has been uploaded yet.")
    .replace("{KNOWLEDGE_CONTEXT}", knowledgeContext)
    .replace("{PERFORMANCE_CONTEXT}", performanceContext || "No performance history available yet — this is a new student.");

  const result = streamText({
    model: anthropic(modelId),
    system: systemPrompt,
    messages: convertMessages(messages),
    temperature: 0.4,
    maxOutputTokens: 1024,
  });

  return result.toTextStreamResponse();
}
