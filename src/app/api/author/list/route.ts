/**
 * GET /api/author/list
 *
 * Lists every `{name}-dialogue.md` / `{name}-dialogue-cipher.md` pair found
 * in the local `rituals/` directory. Dev-only — see _guard.ts.
 */

import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { assertDevLocal } from "../_guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PairEntry {
  name: string;
  hasPlain: boolean;
  hasCipher: boolean;
  plainBytes: number;
  cipherBytes: number;
  plainMtime: number | null;
  cipherMtime: number | null;
}

export async function GET(request: Request) {
  const denied = assertDevLocal(request);
  if (denied) return denied;

  const ritualsDir = path.resolve(process.cwd(), "rituals");
  if (!fs.existsSync(ritualsDir)) {
    return NextResponse.json({ ritualsDir, pairs: [] });
  }

  const entries = fs.readdirSync(ritualsDir);
  const byName = new Map<string, PairEntry>();

  const ensure = (name: string): PairEntry => {
    let entry = byName.get(name);
    if (!entry) {
      entry = {
        name,
        hasPlain: false,
        hasCipher: false,
        plainBytes: 0,
        cipherBytes: 0,
        plainMtime: null,
        cipherMtime: null,
      };
      byName.set(name, entry);
    }
    return entry;
  };

  for (const file of entries) {
    const cipherMatch = /^([a-z0-9][a-z0-9-]*)-dialogue-cipher\.md$/i.exec(file);
    if (cipherMatch) {
      const entry = ensure(cipherMatch[1].toLowerCase());
      entry.hasCipher = true;
      const stat = fs.statSync(path.join(ritualsDir, file));
      entry.cipherBytes = stat.size;
      entry.cipherMtime = stat.mtimeMs;
      continue;
    }
    const plainMatch = /^([a-z0-9][a-z0-9-]*)-dialogue\.md$/i.exec(file);
    if (plainMatch) {
      const entry = ensure(plainMatch[1].toLowerCase());
      entry.hasPlain = true;
      const stat = fs.statSync(path.join(ritualsDir, file));
      entry.plainBytes = stat.size;
      entry.plainMtime = stat.mtimeMs;
    }
  }

  const pairs = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ ritualsDir, pairs });
}
