interface PassphraseInput {
  readonly isTTY?: boolean;
  setRawMode(enabled: boolean): unknown;
  resume(): unknown;
  pause(): unknown;
  setEncoding(encoding: BufferEncoding): unknown;
  on(event: "data" | "end", listener: (...arguments_: never[]) => void): unknown;
  removeListener(
    event: "data" | "end",
    listener: (...arguments_: never[]) => void,
  ): unknown;
}

interface PassphraseOutput {
  write(chunk: string): unknown;
}

export async function readMramPassphrase(
  input: PassphraseInput = process.stdin,
  output: PassphraseOutput = process.stderr,
): Promise<string> {
  const environmentPassphrase = process.env.MRAM_PASSPHRASE;
  if (environmentPassphrase) return environmentPassphrase;
  if (!input.isTTY) throw new Error("Passphrase unavailable");

  output.write("Passphrase: ");
  input.setRawMode(true);
  input.resume();
  input.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let passphrase = "";
    let settled = false;
    const restore = (): void => {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
      input.removeListener("end", onEnd);
      output.write("\n");
    };
    const finish = (result: { value: string } | { error: Error }): void => {
      if (settled) return;
      settled = true;
      restore();
      if ("error" in result) reject(result.error);
      else resolve(result.value);
    };
    const onEnd = (): void => {
      finish({ error: new Error("Passphrase unavailable") });
    };
    const onData = (chunk: string): void => {
      for (const character of chunk) {
        const code = character.charCodeAt(0);
        if (code === 13 || code === 10) {
          finish({ value: passphrase });
          return;
        }
        if (code === 3) {
          finish({ error: new Error("Interrupted") });
          return;
        }
        if (code === 127 || code === 8) {
          passphrase = passphrase.slice(0, -1);
        } else if (code >= 32) {
          passphrase += character;
        }
      }
    };
    input.on("data", onData as (...arguments_: never[]) => void);
    input.on("end", onEnd);
  });
}
