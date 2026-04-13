/**
 * Wrapper around `fetch` for calling this app's own /api routes.
 *
 * Attaches the X-Client-Secret header from NEXT_PUBLIC_RITUAL_CLIENT_SECRET
 * when it's set at build time. The corresponding server middleware checks
 * this header against RITUAL_CLIENT_SECRET. When both are unset (local dev),
 * requests pass through unchanged — the server middleware no-ops.
 *
 * The secret is baked into the client bundle, so it is not strong auth.
 * Its job is to make drive-by curl-abuse of paid AI endpoints (Groq, Mistral,
 * ElevenLabs, Deepgram, Google TTS) significantly less effective. An
 * attacker must fetch and parse the JS bundle to find it before scripting
 * abuse, rather than hitting the URLs directly.
 */

const CLIENT_SECRET = process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET;

/** Merge the client secret into existing fetch headers without clobbering them. */
function withSecret(init?: RequestInit): RequestInit {
  if (!CLIENT_SECRET) return init ?? {};

  const merged: RequestInit = { ...init };
  const headers = new Headers(init?.headers);
  headers.set("X-Client-Secret", CLIENT_SECRET);
  merged.headers = headers;
  return merged;
}

/**
 * Fetch the same-origin API with the client-secret header automatically
 * attached. Drop-in replacement for `fetch(url, init)` when calling
 * `/api/...` routes.
 */
export function fetchApi(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, withSecret(init));
}
