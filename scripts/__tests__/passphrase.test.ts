import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { readMramPassphrase } from "../lib/passphrase";

class FakeInput extends EventEmitter {
  readonly isTTY = true;
  readonly rawModes: boolean[] = [];

  setRawMode(enabled: boolean): this {
    this.rawModes.push(enabled);
    return this;
  }

  resume(): this {
    return this;
  }

  pause(): this {
    return this;
  }

  setEncoding(): this {
    return this;
  }
}

describe("readMramPassphrase", () => {
  it("rejects and restores terminal state when interactive stdin ends", async () => {
    const original = process.env.MRAM_PASSPHRASE;
    delete process.env.MRAM_PASSPHRASE;
    try {
      const input = new FakeInput();
      const output = { write: vi.fn() };
      const reader = readMramPassphrase as unknown as (
        input: FakeInput,
        output: { write: (chunk: string) => unknown },
      ) => Promise<string>;

      const result = reader(input, output);
      input.emit("end");

      await expect(result).rejects.toThrow("Passphrase unavailable");
      expect(input.rawModes).toEqual([true, false]);
      expect(input.listenerCount("data")).toBe(0);
      expect(input.listenerCount("end")).toBe(0);
    } finally {
      if (original === undefined) delete process.env.MRAM_PASSPHRASE;
      else process.env.MRAM_PASSPHRASE = original;
    }
  });
});
