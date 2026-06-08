#!/usr/bin/env npx tsx
/**
 * list-ritual-lines.ts — Print every line in a ritual with its MRAM
 * id, role, cache status, and text. Use to match a problem audio
 * line you heard back to its id, then invalidate + re-bake.
 *
 * Usage:
 *   # Print all lines (long — pipe to less for scrolling)
 *   npx tsx scripts/list-ritual-lines.ts rituals/ea-opening-dialogue.md | less
 *
 *   # Search for a specific word/phrase
 *   npx tsx scripts/list-ritual-lines.ts rituals/ea-opening-dialogue.md --grep "satisfy"
 *
 *   # Only one role
 *   npx tsx scripts/list-ritual-lines.ts rituals/ea-opening-dialogue.md --role WM
 *
 *   # Only uncached lines (that WOULD render on next bake)
 *   npx tsx scripts/list-ritual-lines.ts rituals/ea-opening-dialogue.md --uncached
 *
 * Output columns:
 *   ID     MRAM line id (what invalidate-mram-cache.ts takes)
 *   ROLE   Officer role code
 *   CACHE  ✓ if cached, · if not, ⨯ if hard-skipped (too short to bake)
 *   TEXT   First 80 chars of the line's plain text
 */

import * as fs from "node:fs";
import { parseDialogue } from "../src/lib/dialogue-format";
import { buildFromDialogue } from "../src/lib/dialogue-to-mram";
import { isLineCached } from "./render-gemini-audio";
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

async function main() {
  const argv = process.argv.slice(2);
  // Flags that take a value consume the next argv token. We need to
  // skip those consumed values when extracting positional args or we
  // treat the flag-value as a positional file path by mistake.
  const FLAGS_WITH_VALUE = new Set(["--grep", "--role"]);
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      if (FLAGS_WITH_VALUE.has(a)) i++; // skip the flag's value
      continue;
    }
    positional.push(a);
  }

  if (positional.length < 1) {
    console.error(
      "Usage: npx tsx scripts/list-ritual-lines.ts <plain.md> [cipher.md] \\",
    );
    console.error(
      "         [--grep SUBSTRING] [--role ROLE] [--uncached] [--cached]",
    );
    process.exit(1);
  }

  const plainPath = positional[0];
  const cipherPath =
    positional[1] ?? plainPath.replace(/-dialogue\.md$/, "-dialogue-cipher.md");

  if (!fs.existsSync(plainPath) || !fs.existsSync(cipherPath)) {
    console.error(
      `Error: missing ${!fs.existsSync(plainPath) ? plainPath : cipherPath}`,
    );
    process.exit(1);
  }

  // Parse --grep / --role / --cached / --uncached flags.
  const grepIdx = argv.indexOf("--grep");
  const grep =
    grepIdx >= 0 && argv[grepIdx + 1] ? argv[grepIdx + 1].toLowerCase() : null;
  const roleIdx = argv.indexOf("--role");
  const role = roleIdx >= 0 && argv[roleIdx + 1] ? argv[roleIdx + 1] : null;
  const onlyUncached = argv.includes("--uncached");
  const onlyCached = argv.includes("--cached");

  const plain = parseDialogue(fs.readFileSync(plainPath, "utf-8"));
  const cipher = parseDialogue(fs.readFileSync(cipherPath, "utf-8"));
  if (!plain.metadata) {
    console.error("Error: plain file has no frontmatter");
    process.exit(1);
  }

  // Match bake-time style + voice-cast logic so cache status is
  // computed against the same key the bake would use.
  let stylesPayload: StylesFile | undefined;
  const stylesInferred = plainPath.replace(/-dialogue\.md$/, "-styles.json");
  if (fs.existsSync(stylesInferred)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(stylesInferred, "utf-8"));
      if (parsed?.version === 1 && Array.isArray(parsed.styles)) {
        stylesPayload = parsed;
      }
    } catch {
      // Optional sidecar, same as bake.
    }
  }

  let voiceCast: VoiceCastFile | undefined;
  const voiceCastInferred = plainPath.replace(
    /-dialogue\.md$/,
    "-voice-cast.json",
  );
  if (fs.existsSync(voiceCastInferred)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(voiceCastInferred, "utf-8"));
      const validated = validateVoiceCast(parsed);
      if (validated.ok) voiceCast = validated.value;
    } catch {
      // Optional.
    }
  }

  const { doc } = await buildFromDialogue(plain, cipher, {
    jurisdiction: plain.metadata.jurisdiction!,
    degree: plain.metadata.degree!,
    ceremony: plain.metadata.ceremony!,
    styles: stylesPayload,
  });

  const preambleByRole: Record<string, string> = {};
  if (voiceCast) {
    for (const r of Object.keys(voiceCast.roles)) {
      const p = buildPreamble(voiceCast, r);
      if (p) preambleByRole[r] = p;
    }
  }

  // Build speakAs-by-lineId map so cache status reflects the same key
  // the bake pipeline would compute. Without this, speakAs-overridden
  // lines would incorrectly appear uncached after a successful bake.
  const speakAsByLineId = new Map<number, string>();
  if (stylesPayload) {
    const speakAsByHash = new Map<string, string>();
    for (const entry of stylesPayload.styles) {
      if (entry.speakAs && isValidSpeakAs(entry.speakAs)) {
        speakAsByHash.set(entry.lineHash, entry.speakAs);
      }
    }
    if (speakAsByHash.size > 0) {
      for (const l of doc.lines) {
        if (!l.plain || !l.role) continue;
        const h = await hashLineText(l.plain);
        const sa = speakAsByHash.get(h);
        if (sa) speakAsByLineId.set(l.id, sa);
      }
    }
  }

  // Header
  console.log(`# ${plain.metadata.ceremony} (${plain.metadata.degree})`);
  console.log(
    `# ${doc.lines.length} total lines, filters: ${grep ? `grep="${grep}"` : ""}${role ? ` role=${role}` : ""}${onlyUncached ? " uncached-only" : ""}${onlyCached ? " cached-only" : ""}`,
  );
  console.log("");
  console.log(
    "   ID  ROLE       CACHE  TEXT",
  );
  console.log(
    "-----  --------   -----  -----------------------------------------------------",
  );

  let shown = 0;
  for (const line of doc.lines) {
    // Skip CUE lines (synthetic markers, no spoken content to invalidate)
    // unless the user explicitly greps for them.
    if (line.role === "CUE" && !grep) continue;

    const text = line.plain?.trim() ?? "";
    if (!text && !line.action) continue;

    // Apply filters. Grep matches display text OR the speakAs override
    // so an operator can find a line by either surface.
    const speakAs = speakAsByLineId.get(line.id);
    const bakeText = (speakAs ?? text).trim();
    if (
      grep &&
      !(
        text.toLowerCase().includes(grep) ||
        (line.action ?? "").toLowerCase().includes(grep) ||
        (speakAs ?? "").toLowerCase().includes(grep)
      )
    ) continue;
    if (role && line.role !== role) continue;

    // Determine cache status. Matches the bake's decision logic exactly:
    // hard-skip is on bakeText (speakAs or plain), cache key uses bakeText,
    // preamble is suppressed when speakAs is set.
    let cacheSymbol: string;
    let isCachedNow = false;
    if (!line.role || !bakeText) {
      cacheSymbol = "—";
    } else if (bakeText.length < MIN_BAKE_LINE_CHARS) {
      cacheSymbol = "⨯"; // hard-skip
    } else {
      const voice = getGeminiVoiceForRole(line.role);
      const preamble =
        !speakAs && bakeText.length >= MIN_PREAMBLE_LINE_CHARS
          ? preambleByRole[line.role] ?? ""
          : "";
      isCachedNow = isLineCached(bakeText, line.style, voice, preamble);
      cacheSymbol = isCachedNow ? "✓" : "·";
    }

    if (onlyUncached && (isCachedNow || cacheSymbol !== "·")) continue;
    if (onlyCached && !isCachedNow) continue;

    const displayText =
      line.role === "CUE" && line.action
        ? `[${line.action}]`
        : text.slice(0, 80) + (text.length > 80 ? "…" : "");
    const sayMarker = speakAs ? " 🎤" : "";

    console.log(
      `${line.id.toString().padStart(5)}  ${line.role.padEnd(8)}   ${cacheSymbol}      ${displayText}${sayMarker}`,
    );
    shown++;
  }

  console.log("");
  console.log(`# ${shown} line(s) shown`);
  console.log("");
  console.log("# Legend:  ✓ cached   · uncached   ⨯ hard-skipped (too short)   🎤 speakAs override");
  console.log("# To regenerate a specific line, run:");
  console.log(
    `#   npx tsx scripts/invalidate-mram-cache.ts ${plainPath} --lines=<ID> --yes`,
  );
  console.log("# Then re-run the bake — only those lines re-render.");
}

main().catch((err) => {
  console.error("Fatal:", err.message || err);
  process.exit(1);
});
