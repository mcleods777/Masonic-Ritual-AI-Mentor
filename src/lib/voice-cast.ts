/**
 * Voice-cast director's-notes preamble for Gemini TTS.
 *
 * Gemini 3.1 Flash TTS supports structured preamble prompts that pin a
 * character's voice across every line it speaks. The official docs
 * recommend a three-section format (AUDIO PROFILE / THE SCENE /
 * DIRECTOR'S NOTES) followed by the transcript. With that preamble in
 * place, the model holds a much more consistent performance — measured
 * gravitas on the Worshipful Master, crisp officiousness on the Junior
 * Deacon, etc. — than it does when every line is rendered in isolation
 * with only a single `[gravely]` tag.
 *
 * We use this at bake time only (scripts/build-mram-from-dialogue.ts
 * --with-audio). The runtime /api/tts/gemini route keeps its existing
 * lightweight `[style] text` prompt to avoid per-user token cost on
 * the rare uncached-line fallback path.
 *
 * Format on disk: rituals/{slug}-voice-cast.json (optional sidecar,
 * mirrors the {slug}-styles.json pattern).
 *
 * See:
 *   https://ai.google.dev/gemini-api/docs/speech-generation
 *   docs/BAKE-WORKFLOW.md
 */

// ============================================================
// Schema
// ============================================================

/**
 * Per-role voice characterization. All fields optional — the builder
 * skips any missing line from the preamble rather than emitting an
 * empty label, which keeps the preamble clean when an author has only
 * filled in partial detail for a role.
 */
export interface VoiceCastRole {
  /** Character description — age, station, demeanor. Short, concrete. */
  profile?: string;
  /** Tonal style — "measured, authoritative. slight gravitas." */
  style?: string;
  /** Pacing direction — "deliberate. a pause after each formal phrase." */
  pacing?: string;
  /** Accent specification — specific geography beats vague descriptors. */
  accent?: string;
  /** Freeform additional notes — delivery quirks, breath, register. */
  other?: string;
}

/**
 * Complete voice-cast sidecar. Scene applies to the whole ritual;
 * roles are keyed by role code ("WM", "SW", ...) matching the dialogue
 * file's speaker tokens.
 */
export interface VoiceCastFile {
  version: 1;
  /** Shared scene description — lodge setting, lighting, brethren. */
  scene?: string;
  /** Role code → character card. Missing roles fall back to no preamble. */
  roles: Record<string, VoiceCastRole>;
}

// ============================================================
// Preamble builder
// ============================================================

/**
 * Build the director's-notes preamble for a single spoken line.
 *
 * Returns a preamble string to be prepended to the line's text before
 * it's sent to Gemini TTS. When the voice-cast has nothing for this
 * role, returns empty string — caller falls back to the simple
 * `[style] text` format.
 *
 * The preamble ends with a `TRANSCRIPT` section header so Gemini's
 * classifier has an unambiguous marker for where spoken content
 * begins. Without that header, vague preambles can be read aloud
 * instead of treated as direction (documented failure mode).
 */
export function buildPreamble(
  cast: VoiceCastFile | undefined,
  role: string,
): string {
  if (!cast) return "";
  const roleCard = cast.roles[role];
  if (!roleCard) return "";

  const { profile, style, pacing, accent, other } = roleCard;
  const hasAnyContent =
    profile || style || pacing || accent || other || cast.scene;
  if (!hasAnyContent) return "";

  const lines: string[] = [];

  if (profile) lines.push(`AUDIO PROFILE: ${profile}`);
  if (cast.scene) lines.push(`THE SCENE: ${cast.scene}`);

  const directorLines: string[] = [];
  if (style) directorLines.push(`Style: ${style}`);
  if (pacing) directorLines.push(`Pacing: ${pacing}`);
  if (accent) directorLines.push(`Accent: ${accent}`);
  if (other) directorLines.push(`Notes: ${other}`);

  if (directorLines.length > 0) {
    lines.push("");
    lines.push("DIRECTOR'S NOTES");
    lines.push(...directorLines);
  }

  lines.push("");
  lines.push("TRANSCRIPT");
  return lines.join("\n") + "\n";
}

/**
 * Given a preamble + style + text, return the complete prompt to send
 * to Gemini. Style is still inline-bracketed as before; the preamble
 * just provides the surrounding character context.
 *
 * Examples:
 *   assemblePrompt("",            "gravely",    "So mote it be.")
 *     → "[gravely] So mote it be."
 *
 *   assemblePrompt("AUDIO PROFILE: ...\n\nTRANSCRIPT\n", "gravely", "So mote it be.")
 *     → "AUDIO PROFILE: ...\n\nTRANSCRIPT\n[gravely] So mote it be."
 */
export function assemblePrompt(
  preamble: string,
  style: string | undefined,
  text: string,
): string {
  const inlineStyle = style ? `[${style}] ` : "";
  return `${preamble}${inlineStyle}${text}`;
}

// ============================================================
// Sidecar loader (Node-side, used by the build script)
// ============================================================

/**
 * Validate + narrow a parsed JSON object as a VoiceCastFile. Returns
 * the narrowed value or a descriptive error string. Called by the
 * build script after JSON.parse — refuses to build on malformed input
 * so a typo in the sidecar doesn't silently drop half the preambles.
 */
export function validateVoiceCast(
  raw: unknown,
): { ok: true; value: VoiceCastFile } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "voice-cast: expected an object at top level" };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) {
    return {
      ok: false,
      error: `voice-cast: unsupported version (expected 1, got ${String(obj.version)})`,
    };
  }
  if (typeof obj.roles !== "object" || obj.roles === null) {
    return { ok: false, error: "voice-cast: roles must be an object" };
  }
  // Narrow each role card. Unknown fields are ignored (forward-compatible).
  const narrowedRoles: Record<string, VoiceCastRole> = {};
  for (const [roleCode, cardRaw] of Object.entries(obj.roles)) {
    if (typeof cardRaw !== "object" || cardRaw === null) {
      return {
        ok: false,
        error: `voice-cast: role "${roleCode}" must be an object`,
      };
    }
    const card = cardRaw as Record<string, unknown>;
    const narrowed: VoiceCastRole = {};
    for (const field of ["profile", "style", "pacing", "accent", "other"] as const) {
      const v = card[field];
      if (v === undefined) continue;
      if (typeof v !== "string") {
        return {
          ok: false,
          error: `voice-cast: role "${roleCode}".${field} must be a string`,
        };
      }
      narrowed[field] = v;
    }
    narrowedRoles[roleCode] = narrowed;
  }

  const result: VoiceCastFile = { version: 1, roles: narrowedRoles };
  if (obj.scene !== undefined) {
    if (typeof obj.scene !== "string") {
      return { ok: false, error: "voice-cast: scene must be a string" };
    }
    result.scene = obj.scene;
  }

  return { ok: true, value: result };
}
