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
 * (including preamble rules and MIN_PREAMBLE_LINE_CHARS threshold).
 *
 * Hard-skipped lines (below MIN_BAKE_LINE_CHARS at bake time) have
 * no cache entries; the script reports them as "not cached" — no
 * action needed, those lines already fall through to runtime TTS.
 */

import * as fs from "node:fs";
import { parseDialogue } from "../src/lib/dialogue-format";
import { buildFromDialogue } from "../src/lib/dialogue-to-mram";
import { computeCacheKey, deleteCacheEntry } from "./render-gemini-audio";
import {
  buildPreamble,
  validateVoiceCast,
  type VoiceCastFile,
} from "../src/lib/voice-cast";
import { getGeminiVoiceForRole } from "../src/lib/tts-cloud";
import { hashLineText, isValidSpeakAs, type StylesFile } from "../src/lib/styles";

// Must stay in sync with build-mram-from-dialogue.ts defaults.
const MIN_PREAMBLE_LINE_CHARS = Number(
  process.env.VOICE_CAST_MIN_LINE_CHARS ?? "40",
);
const MIN_BAKE_LINE_CHARS = Number(process.env.MIN_BAKE_LINE_CHARS ?? "5");

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

  // Build speakAs-by-lineId map (same logic as bake script). Lines with
  // a speakAs override compute their cache key against the override text
  // (and skip the preamble), so invalidation must mirror that exactly.
  const speakAsByLineId = new Map<number, string>();
  if (stylesPayload) {
    const speakAsByHash = new Map<string, string>();
    for (const entry of stylesPayload.styles) {
      if (entry.speakAs && isValidSpeakAs(entry.speakAs)) {
        speakAsByHash.set(entry.lineHash, entry.speakAs);
      }
    }
    if (speakAsByHash.size > 0) {
      for (const line of doc.lines) {
        if (!line.plain || !line.role) continue;
        const hash = await hashLineText(line.plain);
        const sa = speakAsByHash.get(hash);
        if (sa) speakAsByLineId.set(line.id, sa);
      }
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

  let foundInCache = 0;
  let notCached = 0;
  let deleted = 0;

  for (const line of targeted) {
    const speakAs = speakAsByLineId.get(line.id);
    const cleanText = (speakAs ?? line.plain).trim();
    const voice = getGeminiVoiceForRole(line.role);

    // Two buckets of "unbakeable": hard-skipped (below MIN_BAKE_LINE_CHARS)
    // and auto-skipped at bake time due to persistent regression. Either
    // way no cache entry exists. Flag these so the user knows they're
    // no-ops, not suppressed failures.
    if (cleanText.length < MIN_BAKE_LINE_CHARS) {
      console.error(
        `  id=${line.id.toString().padStart(3)} ${line.role.padEnd(8)}  "${cleanText.slice(0, 40)}" (${cleanText.length} chars) — hard-skipped at bake, no cache entry`,
      );
      continue;
    }

    const preamble =
      !speakAs && cleanText.length >= MIN_PREAMBLE_LINE_CHARS
        ? preambleByRole[line.role] ?? ""
        : "";

    const cacheKey = computeCacheKey(cleanText, line.style, voice, preamble);

    // Check if cached without touching the cache dir ourselves — defer
    // to the deleteCacheEntry helper so we reuse its logic.
    // Tactic: dry-run by checking existence via fs.existsSync in the
    // invalidation helper's path. Since deleteCacheEntry only deletes
    // if the file exists (returns boolean), we can use its return value
    // to tell cache-hit vs cache-miss, but only after deciding to delete.
    //
    // For dry-run we need a separate existence check. Mirror the path
    // computation from deleteCacheEntry: CACHE_DIR/{key}.opus
    const cacheDir =
      process.env.XDG_CACHE_HOME
        ? `${process.env.XDG_CACHE_HOME}/masonic-mram-audio`
        : `${process.env.HOME}/.cache/masonic-mram-audio`;
    const cachePath = `${cacheDir}/${cacheKey}.opus`;
    const exists = fs.existsSync(cachePath);

    if (!exists) {
      console.error(
        `  id=${line.id.toString().padStart(3)} ${line.role.padEnd(8)}  "${cleanText.slice(0, 40)}${cleanText.length > 40 ? "…" : ""}" — not cached`,
      );
      notCached++;
      continue;
    }

    foundInCache++;

    if (args.yes) {
      const actuallyDeleted = deleteCacheEntry(cacheKey);
      if (actuallyDeleted) deleted++;
      console.error(
        `  id=${line.id.toString().padStart(3)} ${line.role.padEnd(8)}  "${cleanText.slice(0, 40)}${cleanText.length > 40 ? "…" : ""}" — ${actuallyDeleted ? "DELETED" : "already gone"}`,
      );
    } else {
      console.error(
        `  id=${line.id.toString().padStart(3)} ${line.role.padEnd(8)}  "${cleanText.slice(0, 40)}${cleanText.length > 40 ? "…" : ""}" — would delete (cacheKey=${cacheKey.slice(0, 12)}…)`,
      );
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
