#!/usr/bin/env npx tsx
/**
 * lookup-hashed-user.ts — reverse-resolve a truncated hashedUser back
 * to an email from LODGE_ALLOWLIST (SAFETY-04 D-06c).
 *
 * Used when reading a spike-alert email (SAFETY-04) and wanting to know
 * which pilot Brother crossed the threshold. The hashedUser in the alert
 * is sha256(email.trim().toLowerCase()).slice(0, 16) per D-03.
 *
 * Usage:
 *   LODGE_ALLOWLIST="a@x.com,b@y.com" \
 *     npx tsx scripts/lookup-hashed-user.ts 4f2a8c91234567aa
 *
 * Reads LODGE_ALLOWLIST from the environment (same var the auth helper
 * uses). Does not touch `.env.local` — set the var inline or source it.
 * This is deliberate: the script is meant to be run with a full allowlist,
 * not a dev subset.
 *
 * Hash formula MUST match src/lib/hash-user.ts hashedUserFromEmail(); any
 * drift breaks the entire SAFETY-04 alert reverse-lookup promise. Both
 * callsites (client-token mint route + this CLI) import the same helper —
 * edit there, not here.
 */

import { findEmailByHashedUser } from "../src/lib/hash-user";

async function main(): Promise<void> {
  const [targetHash] = process.argv.slice(2);
  if (!targetHash) {
    console.error(
      "Usage: npx tsx scripts/lookup-hashed-user.ts <16-char-hash>",
    );
    process.exit(1);
  }
  const allowlistCsv = process.env.LODGE_ALLOWLIST ?? "";
  if (!allowlistCsv.trim()) {
    console.error("LODGE_ALLOWLIST is empty or unset.");
    process.exit(1);
  }
  const match = findEmailByHashedUser(allowlistCsv, targetHash);
  if (match) {
    console.log(match);
    process.exit(0);
  }
  const n = allowlistCsv.split(",").filter((e) => e.trim()).length;
  console.error(
    `No match for ${targetHash} in LODGE_ALLOWLIST (${n} entries).`,
  );
  process.exit(1);
}

void main();
