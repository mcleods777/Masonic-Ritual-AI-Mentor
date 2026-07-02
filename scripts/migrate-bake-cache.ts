#!/usr/bin/env npx tsx
/**
 * migrate-bake-cache.ts — One-time provenance-preserving cache re-key
 * migration (D-06/D-07).
 *
 * Context: render-gemini-audio.ts's cache key material now includes
 * modelId (CACHE_KEY_VERSION bumped v2 -> v3) and the cache directory
 * moved from ~/.cache/masonic-mram-audio/ (or XDG_CACHE_HOME) to the
 * in-repo rituals/_bake-cache/. Without this migration, every existing
 * cache entry silently misses on the next bake — the exact mistake the
 * abandoned gsd/phase-3-authoring-throughput branch made, burning
 * ~48 minutes of Gemini quota re-rendering ~475 lines that were already
 * cached (see its own 03-05-SUMMARY.md postmortem). This script re-keys
 * every SURVIVING entry in place at ZERO re-render cost instead.
 *
 * Two source locations are treated as migration input (D-05):
 *   - the old LIVE cache: ~/.cache/masonic-mram-audio/ (or XDG_CACHE_HOME),
 *     ~475 entries as of 2026-07
 *   - Shannon's manual BACKUP snapshot: rituals/_bake-cache/ itself
 *     (same directory the NEW cache lives in going forward) — a
 *     superset of ~873 entries preserving renders later invalidated
 *     locally. Treated as migration input, not garbage (D-05).
 *
 * Cache entries are content-addressed by sha256(old-key-material) with
 * no other metadata — the hash cannot be inverted to recover the
 * original (text, style, voice, preamble) tuple. So this script walks
 * every rituals/*-dialogue.md + *-dialogue-cipher.md pair on disk
 * (mirroring invalidate-mram-cache.ts's line reconstruction exactly),
 * recomputes what each line's OLD v2 key would have been, and checks
 * for that key in either source location (union-dedupe: identical
 * keys are byte-identical by construction per D-05, so "keep either"
 * is safe — this script sanity-logs a byte-length mismatch if the two
 * copies ever disagree, but does not do full content comparison).
 *
 * For every matched entry, computes the NEW v3 key via the SAME
 * computeCacheKey export render-gemini-audio.ts uses at bake time
 * (no duplicated key logic), assuming gemini-3.1-flash-tts-preview
 * provenance (A1: the current bake path's handleAbort deletes
 * fallback-tier entries on a quality-tier-drop abort, so any entry
 * surviving to today is premium-tier by construction — see
 * 03-CONTEXT.md Assumptions Log A1). COPIES (never moves) from the old
 * live cache so the source is left intact for rollback.
 *
 * Dry-run by default (prints the plan, writes nothing). Pass --yes to
 * actually perform the migration. Follows invalidate-mram-cache.ts's
 * CLI convention.
 *
 * Usage:
 *   npx tsx scripts/migrate-bake-cache.ts            # dry run
 *   npx tsx scripts/migrate-bake-cache.ts --yes       # execute
 *   npx tsx scripts/migrate-bake-cache.ts --help
 *
 * No package.json script alias exists for author CLIs in this repo
 * (invalidate-mram-cache.ts, list-ritual-lines.ts etc. are all invoked
 * directly via `npx tsx scripts/...`) — this script follows the same
 * convention rather than introducing a new one.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { parseDialogue } from "../src/lib/dialogue-format";
import { buildFromDialogue } from "../src/lib/dialogue-to-mram";
import { computeCacheKey, CACHE_DIR } from "./render-gemini-audio";
import {
  buildPreamble,
  validateVoiceCast,
  type VoiceCastFile,
} from "../src/lib/voice-cast";
import { getGeminiVoiceForRole } from "../src/lib/tts-cloud";
import type { StylesFile } from "../src/lib/styles";

// Must stay in sync with build-mram-from-dialogue.ts / invalidate-mram-cache.ts
// defaults — these thresholds determine which lines had cache entries
// at all, and whether a preamble was mixed into the prompt (and hence
// the old key material).
const MIN_PREAMBLE_LINE_CHARS = Number(
  process.env.VOICE_CAST_MIN_LINE_CHARS ?? "40",
);
const MIN_BAKE_LINE_CHARS = Number(process.env.MIN_BAKE_LINE_CHARS ?? "5");

/**
 * A1 provenance assumption (03-CONTEXT.md Assumptions Log): the current
 * bake path's handleAbort deletes the just-rendered fallback-tier cache
 * entry on a quality-tier-drop abort (build-mram-from-dialogue.ts
 * ~lines 762-807), so any entry surviving in the cache today was either
 * rendered on the preferred model OR rendered on a fallback tier and
 * the run was never aborted (rare, and not distinguishable from the
 * file alone — there is no tier-tagging mechanism yet; D-08's bake
 * manifest will add one). We assume premium provenance for every
 * surviving entry and surface that assumption explicitly rather than
 * silently treating it as verified fact.
 */
const ASSUMED_PROVENANCE_MODEL = "gemini-3.1-flash-tts-preview";

/** The cache key format every existing entry was written under. */
const OLD_CACHE_KEY_VERSION = "v2";

const RITUALS_DIR = path.resolve("rituals");

/** Old live cache location, retired by D-06 (source, left intact). */
const OLD_LIVE_CACHE_DIR = process.env.XDG_CACHE_HOME
  ? path.join(process.env.XDG_CACHE_HOME, "masonic-mram-audio")
  : path.join(process.env.HOME ?? "", ".cache", "masonic-mram-audio");

/**
 * Shannon's manual backup snapshot (D-05) — NOTE this is the SAME
 * directory the new cache lives in (CACHE_DIR === rituals/_bake-cache).
 * Pre-migration, files in here are old-key-named; post-migration, new
 * v3-key-named entries live alongside them. The two never collide
 * because the hash inputs differ.
 */
const OLD_BACKUP_CACHE_DIR = CACHE_DIR;

/** Redact any `?key=...`/`&key=...` query string before it reaches logs. */
function redactKey(text: string): string {
  return text.replace(/[?&]key=[^&"'\s]*/g, "?key=REDACTED");
}

function computeLegacyV2Key(
  text: string,
  style: string | undefined,
  voice: string,
  preamble: string = "",
): string {
  const material = `${OLD_CACHE_KEY_VERSION}\x00${text}\x00${style ?? ""}\x00${voice}\x00${preamble}`;
  return crypto.createHash("sha256").update(material).digest("hex");
}

interface ParsedArgs {
  yes: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  return {
    yes: argv.includes("--yes"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function printHelp(): void {
  console.error(`
migrate-bake-cache.ts — one-time cache relocation + re-key migration (D-06/D-07)

Migrates every surviving Opus cache entry from the legacy locations
(~/.cache/masonic-mram-audio/, or the rituals/_bake-cache/ manual
backup) to the new modelId-inclusive v3 key under rituals/_bake-cache/,
at ZERO re-render cost, assuming gemini-3.1-flash-tts-preview
provenance for every entry (A1 — see script header comment).

Usage:
  npx tsx scripts/migrate-bake-cache.ts            Dry run (default) —
                                                    prints the plan,
                                                    writes nothing.
  npx tsx scripts/migrate-bake-cache.ts --yes       Execute the migration.
  npx tsx scripts/migrate-bake-cache.ts --help      Show this message.

The old ~/.cache location is left intact (COPY, not move) so the
migration is safe to re-run and safe to roll back.
`);
}

interface RitualLineEntry {
  slug: string;
  lineId: number;
  role: string;
  text: string;
  style: string | undefined;
  voice: string;
  preamble: string;
}

/**
 * Walk every rituals/*-dialogue.md + *-dialogue-cipher.md pair, and
 * reconstruct the exact (text, style, voice, preamble) tuple each
 * spoken line would have been baked with — mirroring
 * invalidate-mram-cache.ts's reconstruction (same styles/voice-cast
 * sidecar discovery, same MIN_PREAMBLE_LINE_CHARS threshold) so the
 * legacy key computed here matches the bake path exactly.
 */
async function discoverRitualLines(): Promise<RitualLineEntry[]> {
  if (!fs.existsSync(RITUALS_DIR)) return [];

  const entries: RitualLineEntry[] = [];
  const dialogueFiles = fs
    .readdirSync(RITUALS_DIR)
    .filter((f) => f.endsWith("-dialogue.md"));

  for (const dialogueFile of dialogueFiles) {
    const slug = dialogueFile.replace(/-dialogue\.md$/, "");
    const plainPath = path.join(RITUALS_DIR, dialogueFile);
    const cipherPath = path.join(RITUALS_DIR, `${slug}-dialogue-cipher.md`);
    if (!fs.existsSync(cipherPath)) {
      console.error(
        `  [skip ritual] ${slug}: no matching -dialogue-cipher.md found`,
      );
      continue;
    }

    let plain, cipher;
    try {
      plain = parseDialogue(fs.readFileSync(plainPath, "utf-8"));
      cipher = parseDialogue(fs.readFileSync(cipherPath, "utf-8"));
    } catch (err) {
      console.error(
        `  [skip ritual] ${slug}: failed to parse dialogue: ${redactKey((err as Error).message)}`,
      );
      continue;
    }
    if (!plain.metadata) {
      console.error(`  [skip ritual] ${slug}: plain file has no frontmatter`);
      continue;
    }

    let stylesPayload: StylesFile | undefined;
    const stylesInferred = path.join(RITUALS_DIR, `${slug}-styles.json`);
    if (fs.existsSync(stylesInferred)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(stylesInferred, "utf-8"));
        if (parsed && parsed.version === 1 && Array.isArray(parsed.styles)) {
          stylesPayload = parsed;
        }
      } catch {
        // Silent — styles file optional, same as build/invalidate scripts.
      }
    }

    let voiceCast: VoiceCastFile | undefined;
    const voiceCastInferred = path.join(RITUALS_DIR, `${slug}-voice-cast.json`);
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

    let doc;
    try {
      const built = await buildFromDialogue(plain, cipher, {
        jurisdiction: plain.metadata.jurisdiction!,
        degree: plain.metadata.degree!,
        ceremony: plain.metadata.ceremony!,
        styles: stylesPayload,
      });
      doc = built.doc;
    } catch (err) {
      console.error(
        `  [skip ritual] ${slug}: failed to build from dialogue: ${redactKey((err as Error).message)}`,
      );
      continue;
    }

    const preambleByRole: Record<string, string> = {};
    if (voiceCast) {
      for (const role of Object.keys(voiceCast.roles)) {
        const preamble = buildPreamble(voiceCast, role);
        if (preamble) preambleByRole[role] = preamble;
      }
    }

    for (const line of doc.lines) {
      if (!line.role || !line.plain.trim()) continue;
      const cleanText = line.plain.trim();
      const voice = getGeminiVoiceForRole(line.role);
      const preamble =
        cleanText.length >= MIN_PREAMBLE_LINE_CHARS
          ? preambleByRole[line.role] ?? ""
          : "";
      entries.push({
        slug,
        lineId: line.id,
        role: line.role,
        text: cleanText,
        style: line.style,
        voice,
        preamble,
      });
    }
  }

  return entries;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  console.error(
    args.yes
      ? "Running migration (writes enabled)..."
      : "DRY RUN — no files will be written. Pass --yes to execute.",
  );
  console.error(`  Old live cache:   ${OLD_LIVE_CACHE_DIR}`);
  console.error(`  Backup / new dir: ${OLD_BACKUP_CACHE_DIR}`);
  console.error("");

  const lines = await discoverRitualLines();
  if (lines.length === 0) {
    console.error(
      `No ritual dialogue pairs found under ${RITUALS_DIR} — nothing to migrate.`,
    );
    return;
  }

  let migrated = 0;
  let alreadyMigrated = 0;
  let skippedHardTooShort = 0;
  let skippedNotInOldCache = 0;
  const sourcesTouched = new Set<string>();
  let byteLengthMismatches = 0;

  for (const line of lines) {
    if (line.text.length < MIN_BAKE_LINE_CHARS) {
      // Hard-skipped at bake time (below MIN_BAKE_LINE_CHARS) — no
      // cache entry ever existed for this line.
      skippedHardTooShort++;
      continue;
    }

    const oldKey = computeLegacyV2Key(line.text, line.style, line.voice, line.preamble);
    const liveOld = path.join(OLD_LIVE_CACHE_DIR, `${oldKey}.opus`);
    const backupOld = path.join(OLD_BACKUP_CACHE_DIR, `${oldKey}.opus`);
    const liveExists = fs.existsSync(liveOld);
    const backupExists = fs.existsSync(backupOld);

    let sourcePath: string | null = null;
    if (liveExists && backupExists) {
      // Union-dedupe: identical keys are byte-identical by construction
      // (D-05) — "keep either" is safe. Sanity-log a byte-length
      // mismatch instead of doing a full content comparison.
      try {
        const liveSize = fs.statSync(liveOld).size;
        const backupSize = fs.statSync(backupOld).size;
        if (liveSize !== backupSize) {
          byteLengthMismatches++;
          console.error(
            `  [byte-length sanity] ${line.slug}#${line.lineId}: oldKey=${oldKey.slice(0, 12)}… live=${liveSize}B backup=${backupSize}B differ — keeping live copy`,
          );
        }
      } catch {
        // Best-effort sanity check only — don't block migration on it.
      }
      sourcePath = liveOld;
    } else if (liveExists) {
      sourcePath = liveOld;
    } else if (backupExists) {
      sourcePath = backupOld;
    }

    if (!sourcePath) {
      skippedNotInOldCache++;
      continue;
    }
    sourcesTouched.add(sourcePath);

    const newKey = computeCacheKey(
      line.text,
      line.style,
      line.voice,
      ASSUMED_PROVENANCE_MODEL,
      line.preamble,
    );
    const destPath = path.join(CACHE_DIR, `${newKey}.opus`);

    if (fs.existsSync(destPath)) {
      alreadyMigrated++;
      continue;
    }

    if (args.yes) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      const bytes = fs.readFileSync(sourcePath); // COPY, never move
      const tmp = `${destPath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, bytes);
      fs.renameSync(tmp, destPath); // atomic
    }
    migrated++;
  }

  console.error("");
  console.error(
    `Provenance assumption (A1): every surviving entry treated as ${ASSUMED_PROVENANCE_MODEL}.`,
  );
  console.error(
    `  Rationale: the current bake path's abort handler deletes a just-rendered`,
  );
  console.error(
    `  fallback-tier entry on a quality-tier-drop abort, so survivors are premium`,
  );
  console.error(
    `  by construction — but no tier-tagging mechanism exists yet to CONFIRM this`,
  );
  console.error(
    `  per-entry (D-08's bake manifest will add one). Known-fallback-tier`,
  );
  console.error(
    `  mislabeled count: 0 detected (no signal exists to detect this today — this`,
  );
  console.error(
    `  is a surfaced ASSUMPTION, not a verified fact). Ear-spot-check recommended.`,
  );
  console.error("");
  console.error(`${args.yes ? "Migrated" : "Would migrate"}: ${migrated}`);
  console.error(`Already migrated (dest key exists): ${alreadyMigrated}`);
  console.error(
    `Skipped (hard-skip too short, never cached): ${skippedHardTooShort}`,
  );
  console.error(`Skipped (not found in old cache): ${skippedNotInOldCache}`);
  console.error(`Distinct old-cache source files used: ${sourcesTouched.size}`);
  console.error(`Byte-length sanity mismatches (live vs backup): ${byteLengthMismatches}`);

  if (!args.yes && migrated > 0) {
    console.error("");
    console.error(
      "Re-run with --yes to actually copy these entries into rituals/_bake-cache/ under their new v3 keys.",
    );
    console.error(
      "The old ~/.cache/masonic-mram-audio/ location is left untouched either way.",
    );
  } else if (args.yes && migrated > 0) {
    console.error("");
    console.error(
      "Migration complete. The next bake will cache-hit these lines at zero API cost.",
    );
  }
}

main().catch((err) => {
  console.error("Fatal:", redactKey((err as Error).message || String(err)));
  process.exit(1);
});
