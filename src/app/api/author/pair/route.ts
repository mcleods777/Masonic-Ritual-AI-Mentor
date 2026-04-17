/**
 * GET  /api/author/pair?name=ea-opening — read the plain + cipher source
 *                                          and return a validation roll-up.
 * POST /api/author/pair                  — write the plain + cipher source
 *                                          back to disk and re-validate.
 *
 * Dev-only — see _guard.ts.
 */

import { NextResponse } from "next/server";
import fs from "node:fs";
import { assertDevLocal, resolvePairPaths } from "../_guard";
import { validatePair } from "@/lib/author-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

export async function GET(request: Request) {
  const denied = assertDevLocal(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const name = url.searchParams.get("name") ?? "";
  const paths = resolvePairPaths(name);
  if (!paths) {
    return NextResponse.json({ error: "invalid pair name" }, { status: 400 });
  }

  const plainSource = fs.existsSync(paths.plainPath)
    ? fs.readFileSync(paths.plainPath, "utf-8")
    : "";
  const cipherSource = fs.existsSync(paths.cipherPath)
    ? fs.readFileSync(paths.cipherPath, "utf-8")
    : "";

  const validation =
    plainSource && cipherSource
      ? validatePair(plainSource, cipherSource)
      : null;

  return NextResponse.json({
    name,
    plainSource,
    cipherSource,
    hasPlain: !!plainSource,
    hasCipher: !!cipherSource,
    plainPath: paths.plainPath,
    cipherPath: paths.cipherPath,
    validation,
  });
}

export async function POST(request: Request) {
  const denied = assertDevLocal(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { name?: unknown }).name !== "string" ||
    typeof (body as { plainSource?: unknown }).plainSource !== "string" ||
    typeof (body as { cipherSource?: unknown }).cipherSource !== "string"
  ) {
    return NextResponse.json(
      { error: "body must be { name, plainSource, cipherSource }" },
      { status: 400 },
    );
  }

  const { name, plainSource, cipherSource } = body as {
    name: string;
    plainSource: string;
    cipherSource: string;
  };

  const paths = resolvePairPaths(name);
  if (!paths) {
    return NextResponse.json({ error: "invalid pair name" }, { status: 400 });
  }

  if (
    plainSource.length > MAX_SOURCE_BYTES ||
    cipherSource.length > MAX_SOURCE_BYTES
  ) {
    return NextResponse.json(
      { error: `source files must be ≤ ${MAX_SOURCE_BYTES} bytes each` },
      { status: 413 },
    );
  }

  if (!fs.existsSync(paths.ritualsDir)) {
    fs.mkdirSync(paths.ritualsDir, { recursive: true });
  }

  writeAtomic(paths.plainPath, plainSource);
  writeAtomic(paths.cipherPath, cipherSource);

  const validation = validatePair(plainSource, cipherSource);

  return NextResponse.json({
    name,
    plainPath: paths.plainPath,
    cipherPath: paths.cipherPath,
    savedAt: Date.now(),
    validation,
  });
}

function writeAtomic(target: string, contents: string) {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, contents, "utf-8");
  fs.renameSync(tmp, target);
}
