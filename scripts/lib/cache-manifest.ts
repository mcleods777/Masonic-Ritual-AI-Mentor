/**
 * scripts/lib/cache-manifest.ts — content-hash change-detection manifest
 * (AUTHOR-02 D-07/D-06 replacement for the confirmed-broken git-diff
 * approach — `git diff` can never see gitignored dialogue files, so it
 * silently returned "0 changed" forever on the abandoned branch).
 *
 * Genuinely new logic (no analog on the abandoned branch, whose
 * change-detection function shelled out to a version-control diff over
 * "rituals/*.md" — dead on arrival since .gitignore excludes that glob).
 * This module deliberately contains no version-control tooling
 * invocation of any kind — change detection is entirely
 * sha256(file bytes) comparison against a manifest that this module
 * owns and writes.
 *
 * Manifest location convention: `<ritualsDir>/_bake-cache/_manifest.json`.
 * getChangedRituals/recordBaked derive `ritualsDir` from
 * `dirname(dirname(manifestPath))` so tests can point the manifest at an
 * isolated temp-dir fixture tree without touching real ritual content.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export interface RitualManifestEntry {
  slug: string;
  plainHash: string;
  cipherHash: string;
  bakedAt: string;
}

type Manifest = Record<string, RitualManifestEntry>;

/** Default manifest location: rituals/_bake-cache/_manifest.json */
export const DEFAULT_MANIFEST_PATH = path.join(
  "rituals",
  "_bake-cache",
  "_manifest.json",
);

/** sha256 hex digest of a file's raw bytes. */
export function hashFile(filePath: string): string {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function ritualsDirFromManifestPath(manifestPath: string): string {
  // Convention: <ritualsDir>/_bake-cache/_manifest.json
  return path.dirname(path.dirname(manifestPath));
}

function dialoguePaths(
  ritualsDir: string,
  slug: string,
): { plainPath: string; cipherPath: string } {
  return {
    plainPath: path.join(ritualsDir, `${slug}-dialogue.md`),
    cipherPath: path.join(ritualsDir, `${slug}-dialogue-cipher.md`),
  };
}

function readManifest(manifestPath: string): Manifest {
  if (!fs.existsSync(manifestPath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
    if (typeof raw !== "object" || raw === null) return {};
    return raw as Manifest;
  } catch {
    return {};
  }
}

function writeManifestAtomic(manifestPath: string, manifest: Manifest): void {
  const dir = path.dirname(manifestPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${manifestPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2));
  fs.renameSync(tmp, manifestPath);
}

/**
 * Return the subset of `slugs` whose plain OR cipher dialogue file hash
 * differs from the manifest's recorded hash — plus any slug absent from
 * the manifest entirely (never baked). Unchanged slugs are excluded.
 *
 * A missing dialogue file hashes to "" so it never accidentally matches
 * a real recorded hash — the slug is reported changed, and the caller's
 * validator gate (validateOrFail) is what actually refuses to bake it.
 */
export function getChangedRituals(
  manifestPath: string,
  slugs: string[],
): string[] {
  const manifest = readManifest(manifestPath);
  const ritualsDir = ritualsDirFromManifestPath(manifestPath);
  const changed: string[] = [];
  for (const slug of slugs) {
    const entry = manifest[slug];
    if (!entry) {
      changed.push(slug);
      continue;
    }
    const { plainPath, cipherPath } = dialoguePaths(ritualsDir, slug);
    const plainHash = fs.existsSync(plainPath) ? hashFile(plainPath) : "";
    const cipherHash = fs.existsSync(cipherPath) ? hashFile(cipherPath) : "";
    if (plainHash !== entry.plainHash || cipherHash !== entry.cipherHash) {
      changed.push(slug);
    }
  }
  return changed;
}

/**
 * Upsert `slug`'s current plain/cipher hashes + bakedAt ISO timestamp
 * into the manifest, written atomically (tmp+rename — same idiom as
 * resume-state.ts's writeResumeStateAtomic). Re-hashes both files at
 * record time (never trusts a caller-passed hash) so the recorded value
 * always reflects exactly what was just baked.
 */
export function recordBaked(manifestPath: string, slug: string): void {
  const manifest = readManifest(manifestPath);
  const ritualsDir = ritualsDirFromManifestPath(manifestPath);
  const { plainPath, cipherPath } = dialoguePaths(ritualsDir, slug);
  const plainHash = fs.existsSync(plainPath) ? hashFile(plainPath) : "";
  const cipherHash = fs.existsSync(cipherPath) ? hashFile(cipherPath) : "";
  manifest[slug] = {
    slug,
    plainHash,
    cipherHash,
    bakedAt: new Date().toISOString(),
  };
  writeManifestAtomic(manifestPath, manifest);
}
