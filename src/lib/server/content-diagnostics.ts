import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export interface RawBakeManifestEntry {
  slug: string;
  plainHash: string;
  cipherHash: string;
  bakedAt: string;
}

export interface ContentDiagnosticEntry {
  slug: string;
  assets: {
    plain: boolean;
    cipher: boolean;
    mram: boolean;
    voiceCast: boolean;
    styles: boolean;
  };
  bake: {
    recorded: boolean;
    bakedAt: string | null;
    sourcesCurrent: boolean;
  };
}

export interface ContentDiagnosticsResponse {
  schemaVersion: 1;
  manifestStatus: "missing" | "valid" | "invalid";
  manifestErrors: string[];
  rituals: ContentDiagnosticEntry[];
}

interface ManifestReadResult {
  status: ContentDiagnosticsResponse["manifestStatus"];
  errors: string[];
  entries: Record<string, RawBakeManifestEntry>;
}

function assertContained(projectRoot: string, candidate: string): void {
  const relative = path.relative(projectRoot, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Rituals directory resolves outside project root");
  }
}

export function resolveContainedRitualsDirectory(
  projectRoot: string,
  relativeDirectory = "rituals",
): string {
  const realProjectRoot = fs.realpathSync(projectRoot);
  const candidate = path.resolve(realProjectRoot, relativeDirectory);
  assertContained(realProjectRoot, candidate);

  if (!fs.existsSync(candidate)) return candidate;

  const realCandidate = fs.realpathSync(candidate);
  assertContained(realProjectRoot, realCandidate);
  return realCandidate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function readBakeManifest(ritualsDir: string): ManifestReadResult {
  const manifestPath = path.join(ritualsDir, "_bake-cache", "_manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return { status: "missing", errors: [], entries: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  } catch {
    return { status: "invalid", errors: ["invalid-json"], entries: {} };
  }

  if (!isRecord(parsed)) {
    return { status: "invalid", errors: ["invalid-root"], entries: {} };
  }

  const entries: Record<string, RawBakeManifestEntry> = {};
  const errors: string[] = [];
  const allowedEntryKeys = new Set(["slug", "plainHash", "cipherHash", "bakedAt"]);
  for (const [slug, value] of Object.entries(parsed)) {
    if (
      !SAFE_SLUG.test(slug) ||
      !isRecord(value) ||
      Object.keys(value).length !== allowedEntryKeys.size ||
      Object.keys(value).some((key) => !allowedEntryKeys.has(key)) ||
      value.slug !== slug ||
      typeof value.plainHash !== "string" ||
      !SHA256_HEX.test(value.plainHash) ||
      typeof value.cipherHash !== "string" ||
      !SHA256_HEX.test(value.cipherHash) ||
      !isIsoTimestamp(value.bakedAt)
    ) {
      errors.push("invalid-entry");
      continue;
    }
    entries[slug] = {
      slug,
      plainHash: value.plainHash,
      cipherHash: value.cipherHash,
      bakedAt: value.bakedAt,
    };
  }

  if (errors.length > 0) {
    return { status: "invalid", errors: [...new Set(errors)], entries: {} };
  }
  return { status: "valid", errors: [], entries };
}

function hashFile(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function getAsset(): ContentDiagnosticEntry["assets"] {
  return {
    plain: false,
    cipher: false,
    mram: false,
    voiceCast: false,
    styles: false,
  };
}

function discoverAssets(ritualsDir: string): Map<string, ContentDiagnosticEntry["assets"]> {
  const assetsBySlug = new Map<string, ContentDiagnosticEntry["assets"]>();
  if (!fs.existsSync(ritualsDir)) return assetsBySlug;

  const patterns: Array<{
    pattern: RegExp;
    field: keyof ContentDiagnosticEntry["assets"];
  }> = [
    { pattern: /^([a-z0-9][a-z0-9-]{0,63})-dialogue-cipher\.md$/, field: "cipher" },
    { pattern: /^([a-z0-9][a-z0-9-]{0,63})-dialogue\.md$/, field: "plain" },
    { pattern: /^([a-z0-9][a-z0-9-]{0,63})-voice-cast\.json$/, field: "voiceCast" },
    { pattern: /^([a-z0-9][a-z0-9-]{0,63})-styles\.json$/, field: "styles" },
    { pattern: /^([a-z0-9][a-z0-9-]{0,63})\.mram$/, field: "mram" },
  ];

  for (const fileName of fs.readdirSync(ritualsDir)) {
    const assetPath = path.join(ritualsDir, fileName);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(assetPath);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) continue;

    for (const { pattern, field } of patterns) {
      const match = pattern.exec(fileName);
      if (!match) continue;
      const slug = match[1];
      const assets = assetsBySlug.get(slug) ?? getAsset();
      assets[field] = true;
      assetsBySlug.set(slug, assets);
      break;
    }
  }
  return assetsBySlug;
}

export function buildContentDiagnostics(
  projectRoot: string,
  relativeDirectory = "rituals",
): ContentDiagnosticsResponse {
  const ritualsDir = resolveContainedRitualsDirectory(projectRoot, relativeDirectory);
  const manifest = readBakeManifest(ritualsDir);
  const assetsBySlug = discoverAssets(ritualsDir);
  const slugs = new Set([...assetsBySlug.keys(), ...Object.keys(manifest.entries)]);

  const rituals = [...slugs].sort().map((slug): ContentDiagnosticEntry => {
    const assets = assetsBySlug.get(slug) ?? getAsset();
    const entry = manifest.entries[slug];
    const plainPath = path.join(ritualsDir, `${slug}-dialogue.md`);
    const cipherPath = path.join(ritualsDir, `${slug}-dialogue-cipher.md`);
    const sourcesCurrent = Boolean(
      entry &&
        assets.plain &&
        assets.cipher &&
        hashFile(plainPath) === entry.plainHash &&
        hashFile(cipherPath) === entry.cipherHash,
    );

    return {
      slug,
      assets,
      bake: {
        recorded: Boolean(entry),
        bakedAt: entry?.bakedAt ?? null,
        sourcesCurrent,
      },
    };
  });

  return {
    schemaVersion: 1,
    manifestStatus: manifest.status,
    manifestErrors: manifest.errors,
    rituals,
  };
}
