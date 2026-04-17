// Server-side telemetry for API route events (auth flow).
//
// Callers MUST pass the opt-out flag explicitly (read from the request
// cookies) and a distinctId (hashed email from verified session, or the
// anonymous fallback). No free-text event names or properties — types
// are shared with src/lib/log.ts.

import { PostHog } from "posthog-node";
import type { LogEventName, SafeEventProps } from "./log";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
  if (!key) return null;
  if (client) return client;
  client = new PostHog(key, {
    host,
    flushAt: 1, // send immediately — serverless environment, no long-lived process
    flushInterval: 0,
  });
  return client;
}

export async function logServerEvent(params: {
  distinctId: string;
  name: LogEventName;
  props?: SafeEventProps;
  optedOut: boolean;
}): Promise<void> {
  if (params.optedOut) return;
  const c = getClient();
  if (!c) return;
  try {
    c.capture({
      distinctId: params.distinctId,
      event: params.name,
      properties: params.props,
    });
    await c.flush();
  } catch {
    // Never let telemetry failure break the app.
  }
}
