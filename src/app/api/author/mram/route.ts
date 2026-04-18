/**
 * POST /api/author/mram — write an encrypted .mram file into the local
 *                         rituals/ directory. Dev-only — see _guard.ts.
 *
 * Body: raw application/octet-stream bytes (the encrypted MRAM blob).
 * Query: ?name=ea-opening (required, slug-validated).
 */

import { NextResponse } from "next/server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { assertDevLocal } from "../_guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MRAM_BYTES = 8 * 1024 * 1024;
const MRAM_MAGIC = Buffer.from([0x4d, 0x52, 0x41, 0x4d]); // "MRAM"

export async function POST(request: Request) {
  const denied = assertDevLocal(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const name = url.searchParams.get("name") ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) {
    return NextResponse.json({ error: "invalid name" }, { status: 400 });
  }

  const ritualsDir = path.resolve(process.cwd(), "rituals");
  const target = path.join(ritualsDir, `${name}.mram`);
  const rel = path.relative(ritualsDir, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: "empty body" }, { status: 400 });
  }
  if (buf.length > MAX_MRAM_BYTES) {
    return NextResponse.json(
      { error: `mram body must be ≤ ${MAX_MRAM_BYTES} bytes` },
      { status: 413 },
    );
  }
  if (buf.length < MRAM_MAGIC.length || !buf.subarray(0, MRAM_MAGIC.length).equals(MRAM_MAGIC)) {
    return NextResponse.json(
      { error: "body is not an MRAM file (bad magic bytes)" },
      { status: 400 },
    );
  }

  if (!fs.existsSync(ritualsDir)) {
    await fsp.mkdir(ritualsDir, { recursive: true });
  }

  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(tmp, buf);
  await fsp.rename(tmp, target);

  return NextResponse.json({
    name,
    path: target,
    bytes: buf.length,
    savedAt: Date.now(),
  });
}
