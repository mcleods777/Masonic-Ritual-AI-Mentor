/**
 * Gate for the /api/author/* routes.
 *
 * These endpoints read and write plaintext ritual files on the local
 * filesystem. They must NEVER be reachable in a deployed build — the
 * encrypted .mram pipeline is the only shipped surface. This guard is
 * enforced at two layers:
 *
 *   1. `NODE_ENV !== "production"` — prevents a Vercel build from ever
 *      exposing the route.
 *   2. Request must arrive over loopback (`127.0.0.1` / `::1` / `localhost`)
 *      unless `MRAM_AUTHOR_ALLOW_LAN=1` is set explicitly. Belt-and-
 *      suspenders in case someone runs `next dev` on a public interface.
 *
 * Throws via `NextResponse` on any failure so callers can `return` it.
 */

import { NextResponse } from "next/server";
import path from "node:path";

export function assertDevLocal(
  request: Request,
): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not available" }, { status: 404 });
  }

  if (process.env.MRAM_AUTHOR_ALLOW_LAN !== "1") {
    const host =
      request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
    const loopback =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]";
    if (!loopback) {
      return NextResponse.json(
        {
          error:
            "ritual author tool is only served on localhost. Set MRAM_AUTHOR_ALLOW_LAN=1 to override.",
        },
        { status: 403 },
      );
    }
  }

  return null;
}

/**
 * Resolve a ritual pair name to a pair of absolute paths, refusing any
 * name that would escape the rituals/ directory or contain non-slug chars.
 */
export function resolvePairPaths(pairName: string): {
  ritualsDir: string;
  plainPath: string;
  cipherPath: string;
} | null {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(pairName)) return null;

  const ritualsDir = path.resolve(process.cwd(), "rituals");
  const plainPath = path.join(ritualsDir, `${pairName}-dialogue.md`);
  const cipherPath = path.join(ritualsDir, `${pairName}-dialogue-cipher.md`);

  const plainRel = path.relative(ritualsDir, plainPath);
  const cipherRel = path.relative(ritualsDir, cipherPath);
  if (plainRel.startsWith("..") || cipherRel.startsWith("..")) return null;
  if (path.isAbsolute(plainRel) || path.isAbsolute(cipherRel)) return null;

  return { ritualsDir, plainPath, cipherPath };
}
