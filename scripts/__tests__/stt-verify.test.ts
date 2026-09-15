import { describe, it, expect, vi } from "vitest";
import { verifyLineAudio } from "../lib/stt-verify";

/**
 * AUTHOR-07: bake-side STT round-trip verifier. Direct Groq Whisper call
 * (not via /api/transcribe, which requires a client-token + session a
 * standalone script cannot obtain — see 03-RESEARCH.md "Alternatives
 * Considered"). Diffs the transcript against expected text via wordDiff
 * from ./bake-math (no duplicated diff logic).
 */

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("verifyLineAudio", () => {
  it("sends multipart form-data with Authorization Bearer, the route's exact model id, and MASONIC_PROMPT content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ text: "I do." }));
    const audio = Buffer.from("fake-audio-bytes");

    await verifyLineAudio({
      audio,
      expectedText: "I do.",
      apiKey: "test-groq-key",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-groq-key");

    const form = init.body as FormData;
    expect(form.get("model")).toBe("whisper-large-v3");
    const prompt = form.get("prompt") as string;
    expect(prompt).toContain("Masonic Lodge ritual ceremony");
    expect(prompt).toContain("Worshipful Master");
    expect(form.get("file")).toBeTruthy();
  });

  it("returns ok:true for 'i do' transcript vs expected 'I do.' (case/punctuation-insensitive via wordDiff normalization)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ text: "i do" }));
    const audio = Buffer.from("fake-audio-bytes");

    const result = await verifyLineAudio({
      audio,
      expectedText: "I do.",
      apiKey: "test-groq-key",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(result.missed).toEqual([]);
    expect(result.inserted).toEqual([]);
    expect(result.transcript).toBe("i do");
  });

  it("returns ok:false with missed/inserted populated for 'I don't' vs expected 'I do.'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ text: "I don't" }));
    const audio = Buffer.from("fake-audio-bytes");

    const result = await verifyLineAudio({
      audio,
      expectedText: "I do.",
      apiKey: "test-groq-key",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    expect(result.missed.length).toBeGreaterThan(0);
    expect(result.inserted.length).toBeGreaterThan(0);
  });

  it("redacts the bearer token from thrown error messages", async () => {
    const rawKey = "super-secret-groq-key-98765";
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error: `unauthorized Bearer ${rawKey}` }, false, 401),
    );
    const audio = Buffer.from("fake-audio-bytes");

    try {
      await verifyLineAudio({
        audio,
        expectedText: "I do.",
        apiKey: rawKey,
        fetchImpl,
      });
      expect.unreachable();
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("401");
      expect(message).not.toContain(rawKey);
    }
  });
});
