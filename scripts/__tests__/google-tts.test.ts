import { describe, it, expect, vi } from "vitest";
import { googleTtsBakeCall } from "../lib/google-tts";

/**
 * AUTHOR-04 D-02: Google Cloud TTS short-line fallback call.
 * Ported from Shannon's working proof-of-concept, test-google-line94.mjs
 * (now deleted — see 03-05-SUMMARY.md).
 */

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("googleTtsBakeCall", () => {
  it("POSTs to the synthesize endpoint with input.text equal to the raw line text exactly", async () => {
    const audioContent = Buffer.from("fake-ogg-bytes").toString("base64");
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ audioContent }));

    await googleTtsBakeCall("I do.", "en-US-Neural2-J", "test-api-key", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      "https://texttospeech.googleapis.com/v1/text:synthesize?key=test-api-key",
    );
    expect(init.method).toBe("POST");
    const bodyStr = init.body as string;
    expect(bodyStr).toContain('"text":"I do."');
    const parsed = JSON.parse(bodyStr);
    expect(parsed).toEqual({
      input: { text: "I do." },
      voice: { languageCode: "en-US", name: "en-US-Neural2-J" },
      audioConfig: { audioEncoding: "OGG_OPUS" },
    });
  });

  it("never leaks preamble/scene/style markers into the request body — structural preamble-leak guard (Pitfall 4)", async () => {
    const audioContent = Buffer.from("fake-ogg-bytes").toString("base64");
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ audioContent }));

    // Even if a caller tried to pass preamble-flavored text, the module
    // itself never adds preamble/scene/style markers of its own accord.
    await googleTtsBakeCall("So mote it be.", "en-US-Neural2-D", "test-api-key", fetchImpl);

    const [, init] = fetchImpl.mock.calls[0]!;
    const bodyStr = init.body as string;
    expect(bodyStr).not.toContain("AUDIO PROFILE");
    expect(bodyStr).not.toContain("THE SCENE");
    expect(bodyStr).not.toContain("DIRECTOR'S NOTES");
    expect(bodyStr).not.toContain("TRANSCRIPT");
  });

  it("throws on non-OK response with status and key=REDACTED, never the raw key", async () => {
    const rawKey = "super-secret-key-12345";
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        { error: { message: `permission denied for ?key=${rawKey}` } },
        false,
        403,
      ),
    );

    await expect(
      googleTtsBakeCall("I do.", "en-US-Neural2-J", rawKey, fetchImpl),
    ).rejects.toThrow();

    try {
      await googleTtsBakeCall("I do.", "en-US-Neural2-J", rawKey, fetchImpl);
      expect.unreachable();
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("403");
      expect(message).toContain("key=REDACTED");
      expect(message).not.toContain(rawKey);
    }
  });

  it("returns a Buffer that is the base64-decoded json.audioContent (already OGG_OPUS, no re-encode)", async () => {
    const rawBytes = Buffer.from("some-ogg-opus-bytes-here");
    const audioContent = rawBytes.toString("base64");
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ audioContent }));

    const result = await googleTtsBakeCall(
      "I do.",
      "en-US-Neural2-J",
      "test-api-key",
      fetchImpl,
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.equals(rawBytes)).toBe(true);
  });
});
