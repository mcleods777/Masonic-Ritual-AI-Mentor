import { createHash } from "crypto";

// Short stable opaque identifier derived from an email address. Used as the
// PostHog distinct_id. Brothers appear as 16 hex chars, never as raw email.
// 16 hex chars = 64 bits of entropy, collision-safe at pilot scale.
export function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
