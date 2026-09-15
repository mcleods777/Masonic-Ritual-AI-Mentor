#!/usr/bin/env npx tsx
/**
 * invalidate-mram-cache.ts — Delete specific cache entries so the next
 * bake re-renders just those lines.
 *
 * Use case: you listened to the baked audio for a ritual, heard a line
 * you didn't like, and want to regenerate just that line without
 * nuking the whole cache (which would re-render hundreds of lines).
 *
 * Workflow:
 *   1. Note the MRAM line id(s) of the lines that sound wrong.
 *      (The bake's pre-scan / progress bar / error messages all show
 *      line ids — use those directly.)
 *   2. Run this script with the dialogue file(s) and the ids:
 *        npx tsx scripts/invalidate-mram-cache.ts \
 *          rituals/ea-opening-dialogue.md \
 *          rituals/ea-opening-dialogue-cipher.md \
 *          --lines 66,75,83
 *   3. Review the dry-run output showing what would be deleted.
 *   4. Re-run with --yes to actually delete.
 *   5. Re-run the bake — just those lines miss cache and re-render.
 *
 * Cache keys are computed using the CANONICAL computeCacheKey export
 * from render-gemini-audio.ts, so keys match the bake path exactly
 * (including modelId (D-07) and preamble rules and the
 * MIN_PREAMBLE_LINE_CHARS threshold). Cache lives at rituals/_bake-cache/
 * (D-06) via the exported CACHE_DIR constant — this script never
 * hardcodes the path itself, to stay drift-proof if the location ever
 * moves again.
 *
 * D-01: there is no more "hard-skip" bucket — every line gets baked
 * audio. Short lines (below SHORT_LINE_MAX_CHARS, imported from
 * build-mram-from-dialogue.ts so the two scripts can never drift) have
 * TWO possible cache entries: the Gemini instructional-padded-prompt
 * render, and (if that failed validation at bake time) the Google Cloud
 * TTS fallback render under its own `google:<voice>` modelId. This
 * script checks and can delete both.
 */

import * as fs from "node:fs";
import { parseDialogue } from "../src/lib/dialogue-format";
import { buildFromDialogue } from "../src/lib/dialogue-to-mram";
import {
  computeCacheKey,
  deleteCacheEntry,
  CACHE_DIR,
  DEFAULT_MODELS,
  readModelsFromEnv,
} from "./render-gemini-audio";
import {
  buildPreamble,
  validateVoiceCast,
  type VoiceCastFile,
} from "../src/lib/voice-cast";
import { getGeminiVoiceForRole } from "../src/lib/tts-cloud";
import type { StylesFile } from "../src/lib/styles";
import {
  SHORT_LINE_MAX_CHARS,
  GOOGLE_FALLBACK_DEFAULT_VOICE,
  buildShortLinePrompt,
} from "./build-mram-from-dialogue";

// Must stay in sync with build-mram-from-dialogue.ts defaults.
const MIN_PREAMBLE_LINE_CHARS = Number(
  process.env.VOICE_CAST_MIN_LINE_CHARS ?? "40",
);

interface ParsedArgs {
  plainPath: string;
  cipherPath?: string;
  lineIds: number[];
  roles: string[];
  yes: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const yes = argv.includes("--yes");

  const linesFlag = argv.find((a) => a.startsWith("--lines="));
  const lineIds = linesFlag
    ? linesFlag
        .slice("--lines=".length)
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n))
    : [];

  // Also accept --lines 66,67 (space-separated value) for muscle-memory
  // parity with other CLI tools.
  const linesIdx = argv.indexOf("--lines");
  if (linesIdx >= 0 && argv[linesIdx + 1] && !argv[linesIdx + 1].startsWith("--")) {
    lineIds.push(
      ...argv[linesIdx + 1]
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n)),
    );
  }

  const roleFlag = argv.find((a) => a.startsWith("--role="));
  const roles = roleFlag ? [roleFlag.slice("--role=".length)] : [];
  const roleIdx = argv.indexOf("--role");
  if (roleIdx >= 0 && argv[roleIdx + 1] && !argv[roleIdx + 1].startsWith("--")) {
    roles.push(argv[roleIdx + 1]);
  }

  if (positional.length < 1 || positional.length > 2) {
    throw new Error(
      "Need 1 or 2 positional args: <plain-dialogue.md> [<cipher-dialogue.md>]",
    );
  }

  if (lineIds.length === 0 && roles.length === 0) {
    throw new Error(
      "Specify at least one of --lines=1,2,3 or --role=WM (or --role WM)",
    );
  }

  return {
    plainPath: positional[0],
    cipherPath: positional[1],
    lineIds,
    roles,
    yes,
  };
}

async function main() {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    console.error("");
    console.error(
      "Usage: npx tsx scripts/invalidate-mram-cache.ts <plain.md> [cipher.md] \\",
    );
    console.error("         [--lines=1,2,3] [--role=WM] [--yes]");
    console.error("");
    console.error("Examples:");
    console.error(
      "  # Dry-run: see what would be deleted for lines 66 and 75",
    );
    console.error(
      "  npx tsx scripts/invalidate-mram-cache.ts rituals/ea-opening-dialogue.md --lines=66,75",
    );
    console.error("");
    console.error("  # Actually delete those entries");
    console.error(
      "  npx tsx scripts/invalidate-mram-cache.ts rituals/ea-opening-dialogue.md --lines=66,75 --yes",
    );
    console.error("");
    console.error("  # All WM lines in EA Opening");
    console.error(
      "  npx tsx scripts/invalidate-mram-cache.ts rituals/ea-opening-dialogue.md --role=WM --yes",
    );
    process.exit(1);
  }

  // Load dialogue. If cipher isn't supplied, we still need SOMETHING
  // that buildFromDialogue can pair — but since we're only reading,
  // a nonexistent cipher path means we can't build an MRAMDocument.
  // Enforce: cipher path required (matches how the build pipeline works).
  const cipherPath =
    args.cipherPath ??
    args.plainPath.replace(/-dialogue\.md$/, "-dialogue-cipher.md");

  if (!fs.existsSync(args.plainPath)) {
    console.error(`Error: plain file not found: ${args.plainPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(cipherPath)) {
    console.error(
      `Error: cipher file not found: ${cipherPath}\n` +
        "Pass it explicitly as the second positional arg if auto-discovery failed.",
    );
    process.exit(1);
  }

  const plain = parseDialogue(fs.readFileSync(args.plainPath, "utf-8"));
  const cipher = parseDialogue(fs.readFileSync(cipherPath, "utf-8"));
  if (!plain.metadata) {
    console.error("Error: plain file has no frontmatter");
    process.exit(1);
  }

  // Load styles + voice-cast the same way the build script does so
  // our key computation matches bake-time exactly.
  let stylesPayload: StylesFile | undefined;
  const stylesInferred = args.plainPath.replace(
    /-dialogue\.md$/,
    "-styles.json",
  );
  if (fs.existsSync(stylesInferred)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(stylesInferred, "utf-8"));
      if (parsed && parsed.version === 1 && Array.isArray(parsed.styles)) {
        stylesPayload = parsed;
      }
    } catch {
      // Silent — styles file optional, same as build.
    }
  }

  let voiceCast: VoiceCastFile | undefined;
  const voiceCastInferred = args.plainPath.replace(
    /-dialogue\.md$/,
    "-voice-cast.json",
  );
  if (fs.existsSync(voiceCastInferred)) {
    try {
      const raw = fs.readFileSync(voiceCastInferred, "utf-8");
      const parsed = JSON.parse(raw);
      const validated = validateVoiceCast(parsed);
      if (validated.ok) voiceCast = validated.value;
    } catch {
      // Silent — voice-cast optional.
    }
  }

  const { doc } = await buildFromDialogue(plain, cipher, {
    jurisdiction: plain.metadata.jurisdiction!,
    degree: plain.metadata.degree!,
    ceremony: plain.metadata.ceremony!,
    styles: stylesPayload,
  });

  // Precompute each role's preamble (same logic as bake script).
  const preambleByRole: Record<string, string> = {};
  if (voiceCast) {
    for (const role of Object.keys(voiceCast.roles)) {
      const preamble = buildPreamble(voiceCast, role);
      if (preamble) preambleByRole[role] = preamble;
    }
  }

  // Determine which lines to target. By id and/or by role.
  const idSet = new Set(args.lineIds);
  const roleSet = new Set(args.roles);
  const targeted = doc.lines.filter((l) => {
    if (!l.role || !l.plain.trim()) return false;
    if (idSet.has(l.id)) return true;
    if (roleSet.has(l.role)) return true;
    return false;
  });

  if (targeted.length === 0) {
    console.error(
      "No lines matched. Check your --lines and --role values against the dialogue.",
    );
    process.exit(1);
  }

  console.error(
    `${args.yes ? "Deleting" : "DRY RUN — would delete"} cache entries for ${targeted.length} line(s):`,
  );
  console.error("");

  // Resolved model chain mirrors the bake path's lookup convention
  // (renderLineAudio uses models[0] as the modelId for its cache-hit
  // check) — the env override takes precedence, matching build-mram-
  // from-dialogue.ts / render-gemini-audio.ts resolution order.
  const modelId = (readModelsFromEnv() ?? DEFAULT_MODELS)[0];

  let foundInCache = 0;
  let notCached = 0;
  let deleted = 0;

  for (const line of targeted) {
    const cleanText = line.plain.trim();
    const voice = getGeminiVoiceForRole(line.role);
    const isShort = cleanText.length < SHORT_LINE_MAX_CHARS;

    // D-01: no more hard-skip bucket. Short lines have up to two
    // candidate cache entries: the Gemini instructional-padded-prompt
    // render (premium tier) and, if that failed validation at bake
    // time, the Google Cloud TTS fallback render under its own
    // `google:<voice>` modelId (D-02). Normal lines have exactly one.
    const candidates: { label: string; cacheKey: string }[] = [];
    if (isShort) {
      const paddedText = buildShortLinePrompt(cleanText);
      candidates.push({
        label: modelId,
        cacheKey: computeCacheKey(paddedText, undefined, voice, modelId, ""),
      });
      const googleVoice = voiceCast?.roles[line.role]?.googleVoice ?? GOOGLE_FALLBACK_DEFAULT_VOICE;
      candidates.push({
        label: `google:${googleVoice}`,
        cacheKey: computeCacheKey(cleanText, undefined, googleVoice, `google:${googleVoice}`, ""),
      });
    } else {
      const preamble =
        cleanText.length >= MIN_PREAMBLE_LINE_CHARS
          ? preambleByRole[line.role] ?? ""
          : "";
      candidates.push({
        label: modelId,
        cacheKey: computeCacheKey(cleanText, line.style, voice, modelId, preamble),
      });
    }

    // Check existence without touching the cache dir ourselves — defer
    // to the deleteCacheEntry helper so we reuse its logic. Use the
    // exported CACHE_DIR constant so this script can never drift from
    // the bake path's actual cache location (D-06: rituals/_bake-cache/).
    const existing = candidates
      .map((c) => ({ ...c, path: `${CACHE_DIR}/${c.cacheKey}.opus` }))
      .filter((c) => fs.existsSync(c.path));

    if (existing.length === 0) {
      console.error(
        `  id=${line.id.toString().padStart(3)} ${line.role.padEnd(8)}  "${cleanText.slice(0, 40)}${cleanText.length > 40 ? "…" : ""}" — not cached`,
      );
      notCached++;
      continue;
    }

    foundInCache++;

    for (const c of existing) {
      if (args.yes) {
        const actuallyDeleted = deleteCacheEntry(c.cacheKey);
        if (actuallyDeleted) deleted++;
        console.error(
          `  id=${line.id.toString().padStart(3)} ${line.role.padEnd(8)}  "${cleanText.slice(0, 40)}${cleanText.length > 40 ? "…" : ""}" (${c.label}) — ${actuallyDeleted ? "DELETED" : "already gone"}`,
        );
      } else {
        console.error(
          `  id=${line.id.toString().padStart(3)} ${line.role.padEnd(8)}  "${cleanText.slice(0, 40)}${cleanText.length > 40 ? "…" : ""}" (${c.label}) — would delete (cacheKey=${c.cacheKey.slice(0, 12)}…)`,
        );
      }
    }
  }

  console.error("");
  console.error(
    `Summary: ${foundInCache} cached, ${notCached} not cached, ${deleted} deleted.`,
  );
  if (!args.yes && foundInCache > 0) {
    console.error("");
    console.error("Re-run with --yes to actually delete.");
    console.error(
      "After deletion, re-run the bake — deleted lines will re-render on the preferred model.",
    );
  } else if (args.yes && deleted > 0) {
    console.error("");
    console.error(
      "Re-run the bake — the deleted lines will miss cache and re-render fresh.",
    );
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message || err);
  process.exit(1);
});
