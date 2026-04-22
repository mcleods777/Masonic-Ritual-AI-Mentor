// Fixture file for the no-restricted-syntax PII-guard rule (D-10).
//
// This file INTENTIONALLY fails `npx eslint`. If `npx eslint
// src/lib/__tests__/fixtures/banned-emit.ts` ever exits 0, the rule has
// regressed and PII could start landing in audit records.
//
// See eslint.config.mjs → `no-restricted-syntax` entry.
//
// The file uses `as never` to bypass TypeScript's AuditRecord union
// (which already excludes the banned keys at the type level, per D-09).
// ESLint then catches the literal-object-argument form at lint time —
// this is the defense-in-depth pair described in D-10 and Pitfall 3.
import { emit } from "../../audit-log";

emit({
  kind: "tts",
  prompt: "BANNED — should trip the lint rule",
} as never);
