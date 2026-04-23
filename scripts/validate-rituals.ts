#!/usr/bin/env npx tsx
/**
 * validate-rituals.ts — local-only integration check for rituals/*-dialogue.md.
 *
 * The rituals/ plaintext files are gitignored, so this script is NOT wired
 * into CI. Run it manually after editing either dialogue file:
 *
 *   npx tsx scripts/validate-rituals.ts
 *
 * What it verifies:
 *   1. Both plain and cipher files parse successfully.
 *   2. Both files have identical structure (same speakers, sections, cues,
 *      and action flags, in the same order).
 *   3. parse → serialize → parse is a no-op on structure (round-trip stable).
 *   4. Reports: line counts, speaker breakdown, per-section counts,
 *      and a format-efficiency comparison (markdown vs JSONL vs
 *      speaker+text only).
 *   5. Writes a JSONL sample to /tmp/ so you can eyeball the alternative.
 */

import fs from "node:fs";
import path from "node:path";
import {
  parseDialogue,
  serializeDialogue,
  structureSignature,
  spokenLines,
  speakerBreakdown,
  pairPlainCipher,
  type DialogueDocument,
} from "../src/lib/dialogue-format";

const RITUALS_DIR = path.resolve(__dirname, "..", "rituals");

interface RitualPair {
  plainFile: string;
  cipherFile: string;
  /** True when the pair came from directory discovery (missing files ok). */
  isDefault: boolean;
}

// With no args, discover every `{slug}-dialogue.md` in rituals/ and pair it
// with `{slug}-dialogue-cipher.md`. With 2 args, validate that explicit pair.
// Explicit paths fail loudly if missing; discovered pairs skip gracefully
// (ritual files are gitignored, some may be absent on a fresh checkout).
function parseArgs(): RitualPair[] {
  const args = process.argv.slice(2);
  if (args.length === 2) {
    return [
      {
        plainFile: path.resolve(args[0]),
        cipherFile: path.resolve(args[1]),
        isDefault: false,
      },
    ];
  }
  if (args.length !== 0) {
    console.error(
      "Usage: npx tsx scripts/validate-rituals.ts [<plain.md> <cipher.md>]",
    );
    console.error(
      "  No args: validates every rituals/{slug}-dialogue{,-cipher}.md pair.",
    );
    process.exit(1);
  }
  const files = fs
    .readdirSync(RITUALS_DIR)
    .filter(
      (f) => f.endsWith("-dialogue.md") && !f.endsWith("-dialogue-cipher.md"),
    )
    .sort();
  return files.map((f) => ({
    plainFile: path.join(RITUALS_DIR, f),
    cipherFile: path.join(RITUALS_DIR, f.replace(/-dialogue\.md$/, "-dialogue-cipher.md")),
    isDefault: true,
  }));
}

const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const warn = (msg: string) => console.log(`  ! ${msg}`);
const header = (msg: string) => console.log(`\n${msg}`);
const fail = (msg: string): never => {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
};

// ~4 chars/token is the accepted rule of thumb for English on modern tokenizers.
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

function loadOrSkip(filepath: string, isDefault: boolean): string | null {
  if (!fs.existsSync(filepath)) {
    if (isDefault) {
      // Defaults may legitimately not exist on a fresh checkout — the
      // ritual .md files are gitignored. Skip gracefully so CI doesn't
      // fail in environments that don't have local ritual files.
      warn(`${path.relative(process.cwd(), filepath)} not present (local-only file)`);
      return null;
    }
    // User passed an explicit path that doesn't exist — fail loudly
    fail(`file not found: ${filepath}`);
  }
  return fs.readFileSync(filepath, "utf-8");
}

function toJSONL(doc: DialogueDocument): string {
  const records: string[] = [];
  let currentSection = "";
  for (const node of doc.nodes) {
    if (node.kind === "section") {
      currentSection = node.id;
    } else if (node.kind === "line" && !node.isAction) {
      records.push(
        JSON.stringify({
          section: currentSection,
          speaker: node.speaker,
          text: node.text,
        }),
      );
    }
  }
  return records.join("\n") + "\n";
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}
function padL(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

function validatePair(pair: RitualPair): boolean {
  const { plainFile: PLAIN_FILE, cipherFile: CIPHER_FILE, isDefault } = pair;
  header(`=== Loading ${path.basename(PLAIN_FILE, "-dialogue.md")} ===`);
  const plainSrc = loadOrSkip(PLAIN_FILE, isDefault);
  const cipherSrc = loadOrSkip(CIPHER_FILE, isDefault);

  if (!plainSrc || !cipherSrc) {
    console.log("  Skipping — one or both files missing.");
    return true;
  }
  ok(`loaded ${path.relative(process.cwd(), PLAIN_FILE)}`);
  ok(`loaded ${path.relative(process.cwd(), CIPHER_FILE)}`);

  // ---------------------------------------------------------------------
  header("=== Parsing ===");
  const plain = parseDialogue(plainSrc);
  const cipher = parseDialogue(cipherSrc);
  ok(`plain  — ${plain.nodes.length} nodes, title="${plain.title}"`);
  ok(`cipher — ${cipher.nodes.length} nodes, title="${cipher.title}"`);

  // Frontmatter sanity checks. The plain file should have frontmatter,
  // the cipher file should not (cipher inherits at build time).
  if (plain.metadata) {
    const m = plain.metadata;
    ok(
      `plain metadata: jurisdiction="${m.jurisdiction ?? "(missing)"}", ` +
        `degree="${m.degree ?? "(missing)"}", ceremony="${m.ceremony ?? "(missing)"}"`,
    );
  } else {
    warn(
      `plain file has no frontmatter block (required for build-mram-from-dialogue)`,
    );
  }
  if (cipher.metadata && Object.keys(cipher.metadata).length > 0) {
    warn(
      `cipher file has frontmatter — it will be IGNORED by the build script. ` +
        `Metadata lives in the plain file only.`,
    );
  }

  // Surface unparseable-line warnings. These usually mean a hidden char
  // (BOM, RTL mark, typo with missing colon) prevented a line from being
  // recognized. Silent drops would be a data-loss bug.
  for (const [name, doc] of [
    ["plain", plain],
    ["cipher", cipher],
  ] as const) {
    if (doc.warnings.length > 0) {
      warn(`${name}: ${doc.warnings.length} unparseable line(s) inside sections:`);
      for (const w of doc.warnings.slice(0, 5)) {
        console.log(`      line ${w.lineNo}: ${JSON.stringify(w.line)}`);
      }
      if (doc.warnings.length > 5) {
        console.log(`      ... and ${doc.warnings.length - 5} more`);
      }
      fail(`${name}: refusing to build with unparseable content`);
    }
  }

  if (plain.nodes.length !== cipher.nodes.length) {
    fail(
      `node count mismatch: plain=${plain.nodes.length}, cipher=${cipher.nodes.length}`,
    );
  }
  ok("node counts match");

  // ---------------------------------------------------------------------
  header("=== Structure parity (plain ↔ cipher) ===");
  const sigPlain = structureSignature(plain);
  const sigCipher = structureSignature(cipher);

  if (sigPlain !== sigCipher) {
    const p = sigPlain.split("|");
    const c = sigCipher.split("|");
    for (let i = 0; i < Math.max(p.length, c.length); i++) {
      if (p[i] !== c[i]) {
        console.error(`  First divergence at node ${i}:`);
        console.error(`    plain:  ${p[i] ?? "(end)"}`);
        console.error(`    cipher: ${c[i] ?? "(end)"}`);
        break;
      }
    }
    fail("structure signature mismatch");
  }
  ok("identical structure — plain and cipher are in lockstep");

  // ---------------------------------------------------------------------
  header("=== Round-trip stability ===");
  for (const [name, doc] of [
    ["plain", plain],
    ["cipher", cipher],
  ] as const) {
    const reemitted = serializeDialogue(doc);
    const reparsed = parseDialogue(reemitted);
    const before = structureSignature(doc);
    const after = structureSignature(reparsed);
    if (before !== after) fail(`${name}: round-trip changed structure`);
    ok(`${name}: parse → serialize → parse preserves structure`);
  }

  // ---------------------------------------------------------------------
  header("=== Speaker breakdown ===");
  const breakdown = speakerBreakdown(plain);
  const sorted = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  for (const [speaker, count] of sorted) {
    console.log(`  ${pad(speaker, 14)} ${padL(String(count), 4)} utterances`);
  }
  const totalUtterances = sorted.reduce((sum, [, n]) => sum + n, 0);
  console.log(`  ${pad("(total)", 14)} ${padL(String(totalUtterances), 4)}`);

  // ---------------------------------------------------------------------
  header("=== Per-section line counts ===");
  const sections: string[] = [];
  const perSection: Record<string, number> = {};
  let currentSection = "(preamble)";
  for (const node of plain.nodes) {
    if (node.kind === "section") {
      currentSection = node.title;
      sections.push(currentSection);
      perSection[currentSection] = 0;
    } else if (node.kind === "line") {
      perSection[currentSection] = (perSection[currentSection] ?? 0) + 1;
    }
  }
  for (const title of sections) {
    console.log(`  ${pad(title, 40)} ${padL(String(perSection[title] ?? 0), 4)} lines`);
  }

  // ---------------------------------------------------------------------
  header("=== Line pairing (plain ↔ cipher) ===");
  const pairs = pairPlainCipher(plain, cipher);
  ok(`paired ${pairs.length} line records`);
  console.log("\n  Sample pairs (first 3 spoken):");
  const spokenPairs = pairs.filter((p) => !p.isAction).slice(0, 3);
  for (const p of spokenPairs) {
    console.log(`    [${p.speaker}]`);
    console.log(`       plain:  ${p.plain}`);
    console.log(`       cipher: ${p.cipher}`);
  }

  // ---------------------------------------------------------------------
  header("=== Format efficiency (plain file) ===");

  const markdownSize = plainSrc.length;
  const markdownTokens = estimateTokens(plainSrc);

  const jsonl = toJSONL(plain);
  const jsonlSize = jsonl.length;
  const jsonlTokens = estimateTokens(jsonl);

  const spoken = spokenLines(plain);
  const spokenTranscript =
    spoken.map((l) => `${l.speaker}: ${l.text}`).join("\n") + "\n";
  const spokenSize = spokenTranscript.length;
  const spokenTokens = estimateTokens(spokenTranscript);

  console.log(
    `  ${pad("Format", 30)} ${padL("Bytes", 8)} ${padL("~Tokens", 10)} ${padL("vs Markdown", 14)}`,
  );
  console.log(`  ${"-".repeat(30)} ${"-".repeat(8)} ${"-".repeat(10)} ${"-".repeat(14)}`);

  const rows: Array<[string, number, number]> = [
    ["Markdown file (as stored)", markdownSize, markdownTokens],
    ["JSONL (spoken only)", jsonlSize, jsonlTokens],
    ["SPEAKER: text (spoken only)", spokenSize, spokenTokens],
  ];
  for (const [name, bytes, tokens] of rows) {
    const ratio = bytes / markdownSize;
    const pct = ((ratio - 1) * 100).toFixed(1);
    const sign = ratio >= 1 ? "+" : "";
    console.log(
      `  ${pad(name, 30)} ${padL(String(bytes), 8)} ${padL(String(tokens), 10)} ${padL(`${sign}${pct}%`, 14)}`,
    );
  }

  // ---------------------------------------------------------------------
  header("=== Writing JSONL sample ===");
  const jsonlOut = `/tmp/${path.basename(PLAIN_FILE, ".md")}.jsonl`;
  fs.writeFileSync(jsonlOut, jsonl);
  ok(`wrote ${jsonlOut} (${jsonl.split("\n").length - 1} records)`);
  console.log("\n  First 3 records:");
  for (const line of jsonl.split("\n").slice(0, 3)) {
    if (line) console.log(`    ${line}`);
  }

  console.log(`\n\x1b[32m✓ ${path.basename(PLAIN_FILE, "-dialogue.md")} passed.\x1b[0m`);
  return true;
}

function main() {
  const pairs = parseArgs();
  if (pairs.length === 0) {
    console.log("No ritual dialogue files found in rituals/ — nothing to validate.");
    process.exit(0);
  }
  for (const pair of pairs) {
    validatePair(pair);
  }
  console.log(`\n\x1b[32m✓ All ${pairs.length} ritual(s) validated.\x1b[0m\n`);
}

main();
