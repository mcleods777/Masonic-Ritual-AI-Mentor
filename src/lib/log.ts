// Telemetry helper. Enforces the privacy model in types:
//
//   - Event names are enumerated (LogEventName). No free-text names.
//   - Event properties are a fixed shape (SafeEventProps). No free-text fields.
//
// Ritual content, passphrases, email addresses, or lodge names cannot be
// passed through this interface. If you need a new event, add it to
// LogEventName and extend SafeEventProps with the minimum typed fields
// required. Never add a `message` or `detail` string field.
//
// Captured data: see /PRIVACY.md and the Telemetry Privacy Model in the
// approved design doc.

import posthog from "posthog-js";
import { isOptedOutClient } from "./telemetry-consent";

export type LogEventName =
  | "auth.magic_link.requested"
  | "auth.magic_link.sent"
  | "auth.sign_in.succeeded"
  | "auth.sign_in.failed"
  | "auth.sign_out"
  | "ritual.document.loaded"
  | "ritual.practice.started"
  | "ritual.practice.ended"
  | "ritual.line.attempted"
  | "ritual.line.passed"
  | "ritual.line.failed";

export type SafeEventProps = {
  user_id?: string;
  role?: string;
  document_id?: string;
  section_index?: number;
  line_index?: number;
  duration_ms?: number;
  accuracy_score?: number;
  error_type?: "network" | "auth" | "validation" | "unknown";
};

// Client-side capture. Safe to call before PostHog has initialized — it
// checks the opt-out cookie and the init flag before sending anything.
export function log(name: LogEventName, props?: SafeEventProps): void {
  if (typeof window === "undefined") return;
  if (isOptedOutClient()) return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    posthog.capture(name, props);
  } catch {
    // Never let telemetry failure break the app.
  }
}

// Associate the current anonymous PostHog session with an identified user
// after sign-in. distinctId must be a hashed email (use hashEmail()).
export function identifyUser(distinctId: string): void {
  if (typeof window === "undefined") return;
  if (isOptedOutClient()) return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    posthog.identify(distinctId);
  } catch {
    // ignore
  }
}

// Clear the identified user on sign-out so the next signed-in user doesn't
// inherit this Brother's distinct_id.
export function resetUser(): void {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    posthog.reset();
  } catch {
    // ignore
  }
}
