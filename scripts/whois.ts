#!/usr/bin/env npx tsx
/**
 * whois.ts — Local lookup between email and PostHog distinct_id (hashEmail).
 *
 * Why: PostHog stores Brothers as opaque 16-hex-char hashes. That is the
 * privacy model — PostHog can never see who is who. But the operator (you)
 * already knows the pilot Brothers' emails from LODGE_ALLOWLIST, and needs
 * an operational way to match hashes to people.
 *
 * This script runs locally on your machine, reads LODGE_ALLOWLIST from your
 * local env or from a flag, and prints a private lookup table. It does NOT
 * send anything to PostHog, to a server, or to any network destination.
 *
 * Usage:
 *   npx tsx scripts/whois.ts --all
 *     Print the full email -> hash table for LODGE_ALLOWLIST (or --emails).
 *
 *   npx tsx scripts/whois.ts --email brother@example.com
 *     Hash a single email and print the result.
 *
 *   npx tsx scripts/whois.ts --hash a1b2c3d4e5f6g7h8
 *     Given a hash seen in PostHog, find the matching Brother in the
 *     allowlist. Prints the email if found, "unknown" if not.
 *
 *   npx tsx scripts/whois.ts --emails a@x.com,b@y.com --all
 *     Use a custom comma-separated list instead of LODGE_ALLOWLIST.
 *
 * The script reads .env.local and .env automatically. If neither contains
 * LODGE_ALLOWLIST and --emails is not passed, it errors.
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

function loadEnvFile(path: string): Record<string, string> {
  try {
    const raw = readFileSync(path, "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function getAllowlist(emailsFlag?: string): string[] {
  if (emailsFlag) {
    return emailsFlag
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
  }
  const cwd = process.cwd();
  const merged: Record<string, string | undefined> = {
    ...loadEnvFile(resolve(cwd, ".env")),
    ...loadEnvFile(resolve(cwd, ".env.local")),
    ...process.env,
  };
  const raw = merged.LODGE_ALLOWLIST ?? "";
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

function parseArgs(): {
  mode: "all" | "email" | "hash";
  email?: string;
  hash?: string;
  emails?: string;
} {
  const args = process.argv.slice(2);
  let mode: "all" | "email" | "hash" = "all";
  let email: string | undefined;
  let hash: string | undefined;
  let emails: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--all") mode = "all";
    else if (a === "--email") {
      mode = "email";
      email = args[++i];
    } else if (a === "--hash") {
      mode = "hash";
      hash = args[++i];
    } else if (a === "--emails") {
      emails = args[++i];
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: npx tsx scripts/whois.ts [--all | --email <addr> | --hash <id>] [--emails a,b,c]",
      );
      process.exit(0);
    }
  }

  return { mode, email, hash, emails };
}

function main() {
  const { mode, email, hash, emails } = parseArgs();

  if (mode === "email") {
    if (!email) {
      console.error("ERROR: --email requires an address");
      process.exit(1);
    }
    console.log(hashEmail(email));
    return;
  }

  const list = getAllowlist(emails);

  if (mode === "hash") {
    if (!hash) {
      console.error("ERROR: --hash requires a hash");
      process.exit(1);
    }
    const target = hash.trim().toLowerCase();
    const match = list.find((e) => hashEmail(e) === target);
    if (match) {
      console.log(match);
    } else {
      console.log(
        `unknown (not in ${emails ? "--emails" : "LODGE_ALLOWLIST"})`,
      );
      process.exit(2);
    }
    return;
  }

  // mode === "all"
  if (list.length === 0) {
    console.error(
      "ERROR: no emails found. Pass --emails a,b,c or set LODGE_ALLOWLIST in .env.local.",
    );
    process.exit(1);
  }

  const rows = list.map((e) => ({ email: e, hash: hashEmail(e) }));
  const maxEmail = Math.max(...rows.map((r) => r.email.length), 5);
  console.log(`${"email".padEnd(maxEmail)}   hash`);
  console.log(`${"-".repeat(maxEmail)}   ----------------`);
  for (const r of rows) {
    console.log(`${r.email.padEnd(maxEmail)}   ${r.hash}`);
  }
}

main();
