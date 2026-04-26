#!/usr/bin/env npx tsx
/**
 * rebake-flagged.ts — re-render audio for lines flagged in the review sidecar.
 *
 * Reads rituals/{slug}-review.json, finds lines whose status is flagged-review
 * or flagged-regen, deletes their cache entries (so we get fresh rolls),
 * calls renderLineAudio for each via the same path bake-all uses, surgically
 * updates the .mram with the new audio, re-encrypts, and resets those lines'
 * status to "unmarked" in the review sidecar (their audioHash will change so
 * any prior approval is moot — re-review required).
 *
 * Usage:
 *   npm run rebake-flagged -- --slug ea-closing
 *   npm run rebake-flagged -- --slug ea-closing --statuses flagged-regen
 *   npm run rebake-flagged -- --slug ea-closing --dry-run
 *   npm run rebake-flagged -- --slug ea-closing --force-preamble
 *
 * Flags:
 *   --slug <slug>             Required. Ritual slug (without .mram extension).
 *   --statuses <list>         Comma-separated statuses to rebake.
 *                             Default: "flagged-review,flagged-regen"
 *   --lines <ids>             Comma-separated line IDs to rebake explicitly.
 *                             Overrides --statuses. Useful for iterating on
 *                             the same lines after the script has reset their
 *                             status. Example: --lines 17,22,24,26
 *   --force-preamble          Force the voice-cast preamble on EVERY rebaked
 *                             line, even short ones (overrides
 *                             VOICE_CAST_MIN_LINE_CHARS gate). Use this to
 *                             A/B-test whether short-utterance voice drift is
 *                             caused by missing preamble. Different cache key
 *                             than the original bake — guaranteed fresh.
 *   --dry-run                 Print plan, don't render or write.
 *   --no-backup               Skip the auto-backup .mram copy.
 *
 * Env required:
 *   MRAM_PASSPHRASE           For decrypt + re-encrypt.
 *   GOOGLE_GEMINI_API_KEYS    Comma-separated Gemini keys (or GOOGLE_GEMINI_API_KEY).
 */

import fs from "node:fs";
import path from "node:path";
import { decryptMRAM } from "../src/lib/mram-format";
import { encryptMRAMNode } from "./build-mram-from-dialogue";
import {
  renderLineAudio,
  computeCacheKey,
  deleteCacheEntry,
  DEFAULT_MODELS,
  CACHE_DIR,
} from "./render-gemini-audio";
import { hashLineText } from "../src/lib/styles";
import { buildPreamble, type VoiceCastFile } from "../src/lib/voice-cast";

// ============================================================
// CLI parsing
// ============================================================

const args = process.argv.slice(2);
function flagValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
function flagPresent(flag: string): boolean {
  return args.includes(flag);
}

const slug = flagValue("--slug");
const statusesArg = flagValue("--statuses") ?? "flagged-review,flagged-regen";
const linesArg = flagValue("--lines");
const forcePreamble = flagPresent("--force-preamble");
const dryRun = flagPresent("--dry-run");
const noBackup = flagPresent("--no-backup");

if (!slug) {
  console.error(
    "Usage: rebake-flagged.ts --slug <slug> [--statuses flagged-review,flagged-regen] [--force-preamble] [--dry-run] [--no-backup]",
  );
  process.exit(1);
}

const statusFilter = new Set(
  statusesArg.split(",").map((s) => s.trim()).filter(Boolean),
);

const passphrase = process.env.MRAM_PASSPHRASE;
if (!passphrase) {
  console.error("MRAM_PASSPHRASE env var required");
  process.exit(1);
}

const apiKeysRaw =
  process.env.GOOGLE_GEMINI_API_KEYS ?? process.env.GOOGLE_GEMINI_API_KEY;
if (!apiKeysRaw) {
  console.error(
    "GOOGLE_GEMINI_API_KEYS or GOOGLE_GEMINI_API_KEY env var required",
  );
  process.exit(1);
}
const apiKeys = apiKeysRaw
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ritualsDir = path.resolve("rituals");
const mramPath = path.join(ritualsDir, `${slug}.mram`);
const reviewPath = path.join(ritualsDir, `${slug}-review.json`);
const stylesPath = path.join(ritualsDir, `${slug}-styles.json`);
const voiceCastPath = path.join(ritualsDir, `${slug}-voice-cast.json`);

if (!fs.existsSync(mramPath)) {
  console.error(`.mram not found: ${mramPath}`);
  process.exit(1);
}
if (!fs.existsSync(reviewPath)) {
  console.error(`No review sidecar at ${reviewPath} — nothing has been flagged`);
  process.exit(1);
}

// ============================================================
// Read review sidecar + sidecars
// ============================================================

const reviewRaw = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
const reviewLines: Record<
  string,
  { status: string; note: string; audioHash: string | null; approvedAt: string | null; flaggedAt: string | null }
> = reviewRaw.lines ?? {};

// --lines (explicit IDs) takes precedence over --statuses (sidecar lookup).
// Useful for iterating: after one rebake the script resets status to
// "unmarked", so re-running with --statuses finds nothing. With --lines you
// can keep hitting the same IDs across multiple attempts.
const flaggedIds: number[] = [];
if (linesArg) {
  for (const tok of linesArg.split(",").map((s) => s.trim()).filter(Boolean)) {
    const n = parseInt(tok, 10);
    if (Number.isFinite(n) && n > 0) flaggedIds.push(n);
  }
} else {
  for (const [k, entry] of Object.entries(reviewLines)) {
    if (statusFilter.has(entry.status)) {
      flaggedIds.push(parseInt(k, 10));
    }
  }
}
flaggedIds.sort((a, b) => a - b);

if (flaggedIds.length === 0) {
  console.log(
    linesArg
      ? `No valid line IDs in --lines argument: ${linesArg}`
      : `No lines with status ${[...statusFilter].join("|")} in ${reviewPath}`,
  );
  process.exit(0);
}

console.log(
  linesArg
    ? `Targeting ${flaggedIds.length} explicit line(s): ${flaggedIds.join(", ")}`
    : `Found ${flaggedIds.length} flagged line(s): ${flaggedIds.join(", ")}`,
);

const stylesData: { lineHash: string; style?: string; speakAs?: string }[] =
  fs.existsSync(stylesPath)
    ? (JSON.parse(fs.readFileSync(stylesPath, "utf8")).styles ?? [])
    : [];
const stylesByHash = new Map<string, { style?: string; speakAs?: string }>();
for (const e of stylesData) {
  stylesByHash.set(e.lineHash, { style: e.style, speakAs: e.speakAs });
}

let voiceCast: VoiceCastFile | undefined;
if (fs.existsSync(voiceCastPath)) {
  try {
    voiceCast = JSON.parse(fs.readFileSync(voiceCastPath, "utf8"));
  } catch (e) {
    console.warn(
      `Warning: failed to parse ${voiceCastPath}: ${(e as Error).message}`,
    );
  }
}

// ============================================================
// Decrypt + plan + render + re-encrypt
// ============================================================

(async () => {
  console.log(`Decrypting ${mramPath}…`);
  const buf = fs.readFileSync(mramPath);
  const ab = buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
  const doc = await decryptMRAM(ab, passphrase);
  console.log(
    `  → ${doc.lines.length} lines, voice cast: ${Object.keys(doc.metadata.voiceCast ?? {}).join(", ") || "(none)"}`,
  );

  // Precompute preamble per role — matches build-mram-from-dialogue.ts exactly
  // so cache keys line up. When --force-preamble is set, we still build them
  // but apply differently below (skip the length gate).
  const preambleByRole: Record<string, string> = {};
  if (voiceCast) {
    for (const role of Object.keys(voiceCast.roles)) {
      const p = buildPreamble(voiceCast, role);
      if (p) preambleByRole[role] = p;
    }
  }

  // Length gate (matches build-mram default; env override supported)
  const VOICE_CAST_MIN_LINE_CHARS = parseInt(
    process.env.VOICE_CAST_MIN_LINE_CHARS ?? "40",
    10,
  );

  // Plan: for each flagged line, derive (text, style, voice, preamble)
  type Plan = {
    line: (typeof doc.lines)[number];
    voice: string;
    style?: string;
    speakAs?: string;
    preamble: string;
    text: string; // what we send: speakAs override OR plain
  };
  const plans: Plan[] = [];

  for (const id of flaggedIds) {
    const line = doc.lines.find((l) => l.id === id);
    if (!line) {
      console.warn(`  line ${id}: not found in mram, skipping`);
      continue;
    }
    if (line.action || !line.plain) {
      console.warn(`  line ${id}: stage action / no spoken text, skipping`);
      continue;
    }
    const role = line.role;
    const voice = doc.metadata.voiceCast?.[role];
    if (!voice) {
      console.warn(
        `  line ${id}: role "${role}" has no pinned voice, skipping`,
      );
      continue;
    }
    const lineHash = await hashLineText(line.plain);
    const sidecar = stylesByHash.get(lineHash) ?? {};
    const speakAs = sidecar.speakAs;
    const style = line.style ?? sidecar.style;
    const text = speakAs ?? line.plain;

    // Preamble decision matches build-mram:
    //   - lines with speakAs always SKIP preamble (model gets confused)
    //   - short lines (< VOICE_CAST_MIN_LINE_CHARS) SKIP preamble
    //   - else, use the role's preamble
    // --force-preamble overrides the length gate (still skips for speakAs).
    let preamble = "";
    if (!speakAs) {
      if (forcePreamble || line.plain.length >= VOICE_CAST_MIN_LINE_CHARS) {
        preamble = preambleByRole[role] ?? "";
      }
    }

    plans.push({ line, voice, style, speakAs, preamble, text });
  }

  if (plans.length === 0) {
    console.log("No rebake plans (all flagged lines either missing or skipped).");
    return;
  }

  console.log(`\nRebake plan (${plans.length} line(s)):`);
  for (const p of plans) {
    const flags: string[] = [];
    if (p.speakAs) flags.push("speakAs");
    if (p.style) flags.push(`style=${p.style}`);
    if (p.preamble) flags.push("preamble");
    if (forcePreamble && !p.speakAs && !p.preamble) flags.push("(no preamble: short+no role-card)");
    const preview = JSON.stringify(p.line.plain.slice(0, 50));
    console.log(
      `  ${String(p.line.id).padStart(3)} [${p.line.role}→${p.voice}] ${flags.join(",") || "—"} ${preview}`,
    );
  }

  if (dryRun) {
    console.log("\n--dry-run: not rendering. Done.");
    return;
  }

  // Invalidate cache for these specific (text, style, voice, model, preamble)
  // tuples so we get fresh rolls. Probe ALL models in DEFAULT_MODELS — the
  // original bake may have written under any of them.
  console.log(`\nInvalidating cache entries…`);
  let invalidated = 0;
  for (const p of plans) {
    for (const model of DEFAULT_MODELS) {
      const key = computeCacheKey(p.text, p.style, p.voice, model, p.preamble);
      if (deleteCacheEntry(key, CACHE_DIR)) invalidated++;
    }
  }
  console.log(`  → invalidated ${invalidated} cache entries`);

  // Render
  console.log(`\nRendering ${plans.length} line(s) via Gemini…`);
  const opts = { apiKeys, models: DEFAULT_MODELS, cacheDir: CACHE_DIR };

  let rendered = 0;
  for (const p of plans) {
    process.stdout.write(
      `  ${String(p.line.id).padStart(3)} [${p.line.role}] (${p.text.length} chars)… `,
    );
    try {
      const audioBuf = await renderLineAudio(
        p.text,
        p.style,
        p.voice,
        opts,
        p.preamble,
      );
      p.line.audio = audioBuf.toString("base64");
      console.log(`✓ ${audioBuf.length} bytes`);
      rendered++;
    } catch (e) {
      console.log(`✗ ${(e as Error).message}`);
    }
  }
  console.log(`\nRendered ${rendered}/${plans.length}`);

  if (rendered === 0) {
    console.log("Nothing rendered. Leaving .mram untouched.");
    return;
  }

  // Backup + re-encrypt + atomic write
  if (!noBackup) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = `${mramPath}.backup-rebake-${ts}`;
    fs.copyFileSync(mramPath, backup);
    console.log(`Backed up to ${backup}`);
  }

  console.log("Re-encrypting…");
  const reEncrypted = encryptMRAMNode(doc, passphrase);
  const tmpPath = `${mramPath}.tmp`;
  fs.writeFileSync(tmpPath, reEncrypted);
  fs.renameSync(tmpPath, mramPath);
  console.log(`Wrote ${reEncrypted.length} bytes to ${mramPath}`);

  // Reset audio-related metadata for every rebaked line — audioHash changed
  // so any prior approval is now stale by definition. Note + status policy:
  //   - if the line was "approved" → demote to "unmarked" (the approval was
  //     for the old audio; user must re-listen).
  //   - if the line was "flagged-review" or "flagged-regen" → KEEP that flag
  //     so the user can iterate on the same set across multiple rebakes
  //     without having to re-flag by hand.
  //   - notes always preserved.
  for (const p of plans) {
    const key = String(p.line.id);
    const entry = reviewLines[key];
    if (!entry) continue;
    entry.audioHash = null;
    entry.approvedAt = null;
    if (entry.status === "approved") {
      entry.status = "unmarked";
      entry.flaggedAt = null;
    }
    // flagged-* stays as-is so the next rebake run with --statuses finds them
  }
  reviewRaw.lines = reviewLines;
  reviewRaw.updatedAt = new Date().toISOString();
  fs.writeFileSync(reviewPath, JSON.stringify(reviewRaw, null, 2));
  console.log(`Reset ${rendered} line(s) to unmarked in ${reviewPath} (notes preserved)`);

  console.log("\nDone. Reload preview-bake to audition the new takes.");
})().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
