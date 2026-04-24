/**
 * scripts/lib/validate-or-fail.ts — shared cipher/plain validator gate.
 *
 * Single source of truth for the AUTHOR-05 D-08 validator-gate.
 * Used by BOTH scripts/bake-all.ts (orchestrator pre-flight) and
 * scripts/build-mram-from-dialogue.ts (per-ritual sub-process) so the
 * gate cannot silently drift between the two. (HI-01 in 03-REVIEW.md.)
 *
 * The gate runs BEFORE any API call per ritual (PATTERNS.md
 * §Validator-gate; anti-pattern §4) — waste zero quota on corrupted
 * pairs. Any severity="error" issue (including D-08 bake-band
 * word-ratio outliers from src/lib/author-validation.ts) exits non-zero.
 *
 * No --force override in Phase 3 (CONTEXT D-08). Shannon's intent is
 * "rewrite the bad cipher line rather than ship an .mram that scores
 * wrong" — this gate makes that the default.
 */

import * as fs from "node:fs";
import { validatePair } from "../../src/lib/author-validation";

/**
 * Validate a (plain, cipher) dialogue pair. On any severity="error" issue
 * or structure-parity mismatch, prints a structured report to stderr and
 * exits with code 1. Returns void on clean validation.
 *
 * The `slug` argument (optional) is used ONLY for prefixing error output
 * — the orchestrator passes it to disambiguate which ritual failed when
 * iterating; the per-ritual sub-process omits it because only one ritual
 * is in play.
 *
 * Missing-file handling: the orchestrator pre-checks both files via
 * `fs.existsSync` and emits its own "missing plain or cipher file" error
 * before calling here, so this function assumes both paths exist.
 * (Keeping missing-file policy at the call site preserves the orchestrator's
 * per-ritual iteration/continue semantics.)
 */
export function validateOrFail(
  plainPath: string,
  cipherPath: string,
  slug?: string,
): void {
  const plain = fs.readFileSync(plainPath, "utf8");
  const cipher = fs.readFileSync(cipherPath, "utf8");
  const result = validatePair(plain, cipher);
  const errors = result.lineIssues.filter((i) => i.severity === "error");
  if (errors.length > 0 || !result.structureOk) {
    const prefix = slug ? `[AUTHOR-05 D-08] ${slug}` : `[AUTHOR-05 D-08]`;
    console.error(
      `\n${prefix}: validator refused to bake ${plainPath} (${errors.length} issues)`,
    );
    if (!result.structureOk) {
      console.error(
        `  structure parity failed: ${JSON.stringify(result.firstDivergence)}`,
      );
    }
    for (const issue of errors) {
      console.error(`  [${issue.kind}] line ${issue.index}: ${issue.message}`);
    }
    console.error(
      `\nFix the cipher/plain drift and re-run. No --force in Phase 3 (CONTEXT D-08).`,
    );
    process.exit(1);
  }
}
