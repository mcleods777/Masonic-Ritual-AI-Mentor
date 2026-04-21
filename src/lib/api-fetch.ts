/**
 * Wrapper around `fetch` for calling this app's own /api routes.
 *
 * Attaches TWO independent headers on every call (SAFETY-05, D-15):
 *
 *   - X-Client-Secret: build-time env var baked into the client bundle.
 *     Low-strength deterrent against drive-by curl abuse — an attacker
 *     must fetch and parse the JS bundle before scripting against
 *     /api/tts, /api/transcribe, /api/rehearsal-feedback. Rotated via
 *     docs/runbooks/SECRET-ROTATION.md.
 *
 *   - Authorization: Bearer <1h client-token>. Obtained from
 *     POST /api/auth/client-token on the first fetchApi call (bootstrap,
 *     cookie-auth only). Stored in module scope. Refreshed proactively
 *     at 50 min via setTimeout (10-min safety before the 1h expiry) and
 *     reactively on any 401 + {error:"client_token_expired" | "client_token_invalid"}
 *     response (one-shot retry — a second failure returns the 401 as-is
 *     to avoid infinite loops).
 *
 * The two headers gate independent concerns: X-Client-Secret is a perimeter
 * speed-bump (it's in the bundle, so it's not secret); Authorization is
 * the per-session bearer that ties a request back to a valid pilot-session
 * cookie. The server-side middleware enforces both starting with SAFETY-05.
 *
 * Background-tab throttling caveat (RESEARCH §Pitfall 5): browsers throttle
 * setTimeout in background tabs, so the 50-min timer can fire anywhere from
 * 50-90+ min after it was scheduled. Two safety nets:
 *   1. A visibilitychange listener re-schedules the timer when the tab
 *      foregrounds (same pattern as src/lib/screen-wake-lock.ts).
 *   2. The reactive 401 retry — expired-token detection at request time.
 *
 * Bootstrap order: on the very first fetchApi call we don't yet have a
 * client-token, so the bootstrap POST itself goes out with credentials:
 * "include" (for the pilot-session cookie) but no Authorization header.
 * That endpoint sits under /api/auth/* which is the existing carve-out in
 * middleware, so it doesn't require a client-token to reach. Renaming
 * /api/auth/client-token breaks the chicken-and-egg.
 *
 * If bootstrap fails (unsigned-in user, network blip), fetchApi still
 * issues the original call with X-Client-Secret attached — the server's
 * 401 is the right failure mode for an unauthenticated paid-route call,
 * not a client-side crash.
 */

const CLIENT_SECRET = process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET;
const REFRESH_MS = 50 * 60 * 1000; // 10-min safety before the 1h token expiry

let clientToken: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let bootstrapInFlight: Promise<string | null> | null = null;

async function fetchClientToken(): Promise<string | null> {
  try {
    const resp = await fetch("/api/auth/client-token", {
      method: "POST",
      credentials: "include",
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as { token?: string; expiresIn?: number };
    return typeof body.token === "string" ? body.token : null;
  } catch {
    return null;
  }
}

function scheduleRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    void fetchClientToken().then((fresh) => {
      if (fresh) {
        clientToken = fresh;
        scheduleRefresh();
      } else {
        // Proactive refresh failed — clear token; the reactive 401 path
        // will re-bootstrap on the next request if the server demands it.
        clientToken = null;
      }
    });
  }, REFRESH_MS);
}

async function ensureToken(): Promise<string | null> {
  if (clientToken) return clientToken;
  if (!bootstrapInFlight) {
    bootstrapInFlight = fetchClientToken().then((tok) => {
      clientToken = tok;
      if (tok) scheduleRefresh();
      bootstrapInFlight = null;
      return tok;
    });
  }
  return bootstrapInFlight;
}

// visibilitychange listener (D-13 + RESEARCH Pitfall 5) — reset the
// proactive timer when the tab foregrounds, since browsers throttle
// setTimeout in background tabs and the 50-min deadline could slip past
// 60 min in real use. Same pattern as src/lib/screen-wake-lock.ts.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && clientToken) {
      scheduleRefresh();
    }
  });
}

function withBothHeaders(
  init: RequestInit | undefined,
  token: string | null,
): RequestInit {
  const merged: RequestInit = { ...init };
  const headers = new Headers(init?.headers);
  if (CLIENT_SECRET) headers.set("X-Client-Secret", CLIENT_SECRET);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  merged.headers = headers;
  return merged;
}

/**
 * Fetch the same-origin API with X-Client-Secret + Authorization: Bearer
 * attached automatically. Drop-in replacement for `fetch(url, init)` when
 * calling `/api/...` routes. Public signature unchanged from Phase 1; the
 * internals now also manage the 1h client-token lifecycle.
 */
export async function fetchApi(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = await ensureToken();
  const enriched = withBothHeaders(init, token);
  const resp = await fetch(input, enriched);

  // Reactive 401 retry on expired client-token (one shot — no infinite loop).
  if (resp.status === 401) {
    const cloned = resp.clone();
    let errKind: string | undefined;
    try {
      const body = (await cloned.json()) as { error?: string };
      errKind = body.error;
    } catch {
      // Response body wasn't JSON — fall through without retry.
    }
    if (
      errKind === "client_token_expired" ||
      errKind === "client_token_invalid"
    ) {
      clientToken = null;
      const fresh = await ensureToken();
      if (fresh) {
        return fetch(input, withBothHeaders(init, fresh));
      }
    }
  }
  return resp;
}

/** Test-only: clear in-memory state between test cases. */
export function __resetApiFetchForTests(): void {
  clientToken = null;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  bootstrapInFlight = null;
}
