/**
 * POST /api/author/suggest-styles — dev-local LLM-backed style suggestions.
 *
 * Takes a batch of ritual lines and returns one Gemini 3.1 Flash TTS audio
 * tag per line. Author tool presents them inline for Accept / Edit / Skip.
 *
 * Per review decision 5A: per-line best-effort. One line's LLM error marks
 * that line as `{ suggestion: null, error: "..." }` — rest of the batch
 * succeeds. Author UI shows a Retry button on errored lines.
 *
 * Per review decision 13A (concurrency): up to 5 parallel LLM calls.
 *
 * LLM choice: the design doc locked Claude via Anthropic SDK for subject-
 * matter reasoning. This first implementation uses the existing
 * Groq / Mistral integration (same stack as /api/rehearsal-feedback) to
 * avoid adding a new SDK dependency during the initial build. The prompt
 * and validation layer are provider-agnostic — swap the model later if
 * accept rate underperforms Success Criterion #2.
 *
 * Dev-local only — _guard.ts enforces NODE_ENV !== production + loopback.
 */

import { NextResponse } from "next/server";
import { assertDevLocal } from "../_guard";
import {
  STYLE_TAG_PATTERN,
  RITUAL_STYLE_WHITELIST,
} from "@/lib/styles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONCURRENCY = 5;
const MAX_BATCH = 200;

interface SuggestRequestLine {
  lineId: number;
  role: string;
  speaker: string;
  text: string;
  neighbors: string[];
}

interface SuggestResultLine {
  lineId: number;
  suggestion: string | null;
  error?: string;
}

function getProvider(): {
  url: string;
  model: string;
  authHeader: string;
} | null {
  if (process.env.GROQ_API_KEY) {
    return {
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: process.env.FEEDBACK_MODEL || "llama-3.3-70b-versatile",
      authHeader: `Bearer ${process.env.GROQ_API_KEY}`,
    };
  }
  if (process.env.MISTRAL_API_KEY) {
    return {
      url: "https://api.mistral.ai/v1/chat/completions",
      model: process.env.FEEDBACK_MODEL || "mistral-small-latest",
      authHeader: `Bearer ${process.env.MISTRAL_API_KEY}`,
    };
  }
  return null;
}

const SYSTEM_PROMPT = `You suggest Google Gemini 3.1 Flash TTS audio tags for Masonic ritual lines.

Gemini tags are bracket-wrapped single words that direct expressive delivery: [gravely], [reverently], [hushed], [warmly], [slowly].

Rules:
- Return exactly ONE tag. Lowercase. Single word or short phrase (hyphen/space allowed). Max 30 chars.
- No brackets in your reply — just the word.
- No commas. No multi-word emotional descriptions.
- Prefer this whitelist when it fits: ${RITUAL_STYLE_WHITELIST.join(", ")}.
  If none fit, pick a single descriptive word (e.g. "grandfatherly", "steady").
- Consider the speaker's role and the line's emotional weight.
- If the line is a mundane procedural statement ("Brother Senior Warden, have you anything..."), pick "neutral".
- For binding oaths, judgments, or solemn declarations, prefer "gravely", "solemnly", or "binding".
- For prayers and invocations, prefer "reverently" or "prayerful".
- For greetings and warm passages, "warmly" or "brotherly".`;

function buildUserPrompt(line: SuggestRequestLine): string {
  const before = line.neighbors.slice(0, 2).filter(Boolean).join("\n");
  const after = line.neighbors.slice(2, 4).filter(Boolean).join("\n");
  return [
    before ? `Previous lines:\n${before}` : null,
    `Role: ${line.role} (${line.speaker})`,
    `Line: ${line.text}`,
    after ? `Following lines:\n${after}` : null,
    "One audio tag:",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function suggestOne(
  line: SuggestRequestLine,
  provider: { url: string; model: string; authHeader: string },
): Promise<SuggestResultLine> {
  try {
    const resp = await fetch(provider.url, {
      method: "POST",
      headers: {
        Authorization: provider.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(line) },
        ],
        temperature: 0.3,
        max_tokens: 16,
      }),
    });
    if (!resp.ok) {
      return {
        lineId: line.lineId,
        suggestion: null,
        error: `LLM ${resp.status}`,
      };
    }
    const j = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = j.choices?.[0]?.message?.content ?? "";
    const cleaned = raw
      .trim()
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/[.!?,;:"]+$/g, "")
      .trim();
    if (!STYLE_TAG_PATTERN.test(cleaned)) {
      return {
        lineId: line.lineId,
        suggestion: null,
        error: `invalid tag shape: "${raw}"`,
      };
    }
    return { lineId: line.lineId, suggestion: cleaned };
  } catch (err) {
    return {
      lineId: line.lineId,
      suggestion: null,
      error: (err as Error).message || "network error",
    };
  }
}

/** Concurrency-limited map — fire up to N at once, wait for completion. */
async function mapPooled<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function POST(request: Request) {
  const denied = assertDevLocal(request);
  if (denied) return denied;

  const provider = getProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "No LLM API key configured (set GROQ_API_KEY or MISTRAL_API_KEY)" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const lines = (body as { lines?: unknown })?.lines;
  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json(
      { error: "body must be { lines: [{ lineId, role, speaker, text, neighbors }] }" },
      { status: 400 },
    );
  }
  if (lines.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `batch must be ≤ ${MAX_BATCH} lines (got ${lines.length})` },
      { status: 413 },
    );
  }

  // Shape-check each entry. Skip bad entries with an error slot rather
  // than rejecting the whole batch — per review decision 5A.
  const typed: (SuggestRequestLine | SuggestResultLine)[] = lines.map((raw, idx) => {
    const r = raw as Record<string, unknown>;
    const lineId = typeof r.lineId === "number" ? r.lineId : idx;
    if (
      typeof r.role !== "string" ||
      typeof r.speaker !== "string" ||
      typeof r.text !== "string" ||
      !Array.isArray(r.neighbors)
    ) {
      return {
        lineId,
        suggestion: null,
        error: "invalid line shape",
      } satisfies SuggestResultLine;
    }
    return {
      lineId,
      role: r.role,
      speaker: r.speaker,
      text: r.text,
      neighbors: r.neighbors.map(String).slice(0, 4),
    } satisfies SuggestRequestLine;
  });

  // Run LLM on the valid entries, pass through the pre-shaped errors.
  const results = await mapPooled(typed, CONCURRENCY, async (item) => {
    if ("suggestion" in item) return item;
    return suggestOne(item, provider);
  });

  return NextResponse.json({ results });
}
