import { describe, it, expect } from "vitest";
import * as nodeCrypto from "node:crypto";
import { parseDialogue } from "../dialogue-format";
import {
  buildFromDialogue,
  normalizeRole,
  CUE_ROLE,
} from "../dialogue-to-mram";
import {
  encryptMRAM,
  decryptMRAM,
  mramToPlainText,
  type MRAMDocument,
} from "../mram-format";

// Node-side encryptor — mirrors scripts/build-mram-from-dialogue.ts exactly
// so this test catches any drift between the Node CLI path and the browser
// decryptMRAM path. Both sides produce/consume the same binary layout:
//   MAGIC(4) | VERSION(1) | SALT(16) | IV(12) | CIPHERTEXT | AUTH_TAG(16)
function encryptMRAMNodeForTest(
  doc: MRAMDocument,
  passphrase: string,
): ArrayBuffer {
  const MAGIC = Buffer.from("MRAM", "ascii");
  const linesJson = JSON.stringify(doc.lines);
  doc.metadata.checksum = nodeCrypto
    .createHash("sha256")
    .update(linesJson)
    .digest("hex");

  const jsonBytes = Buffer.from(JSON.stringify(doc), "utf-8");
  const salt = nodeCrypto.randomBytes(16);
  const iv = nodeCrypto.randomBytes(12);
  const key = nodeCrypto.pbkdf2Sync(passphrase, salt, 310_000, 32, "sha256");

  const cipher = nodeCrypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(jsonBytes), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const out = Buffer.concat([
    MAGIC,
    Buffer.from([1]),
    salt,
    iv,
    encrypted,
    authTag,
  ]);
  // Return as ArrayBuffer so decryptMRAM accepts it
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

// Synthetic dialogue — does NOT contain real ritual content so this test
// runs in CI without depending on gitignored rituals/ files.
const PLAIN = `# Test Dialogue

---

## I. Greetings

WM: Brother Senior Warden, greet the brethren.
SW: Brethren, greetings.
SW: [raises hand]
[if the hall is full]
WM: Let all proceed.
[else]
WM: We wait for more.
[end]

---

## II. Closing

WM: Brother Junior Deacon, close the door.
JD: The door is closed, Worshipful Master.
All: So mote it be.
WM/Chaplain: Amen.
`;

const CIPHER = `# Test Dialogue

---

## I. Greetings

WM: Br SW, grt t brn.
SW: Brn, grts.
SW: [rs hd]
[if the hall is full]
WM: Lt al prcd.
[else]
WM: We wt fr mr.
[end]

---

## II. Closing

WM: Br JD, cls t dr.
JD: T dr i cls, WM.
All: S mt i b.
WM/Chaplain: Amn.
`;

const OPTS = {
  jurisdiction: "Test Jurisdiction",
  degree: "Test Degree",
  ceremony: "Test Ceremony",
};

describe("normalizeRole", () => {
  it("maps known speakers to canonical ids", () => {
    expect(normalizeRole("WM").id).toBe("WM");
    expect(normalizeRole("Tyler").id).toBe("Tyl");
    expect(normalizeRole("Voucher").id).toBe("Vchr");
    expect(normalizeRole("All").id).toBe("ALL");
    expect(normalizeRole("WM/Chaplain").id).toBe("Ch");
  });

  it("is case-insensitive — typos don't create phantom roles", () => {
    // Regression guard: `Wm`, `wm`, `WM`, `wM` must all collapse to the
    // same canonical role to prevent the role-picker showing duplicates.
    expect(normalizeRole("wm").id).toBe("WM");
    expect(normalizeRole("Wm").id).toBe("WM");
    expect(normalizeRole("wM").id).toBe("WM");
    expect(normalizeRole("tyler").id).toBe("Tyl");
    expect(normalizeRole("TYLER").id).toBe("Tyl");
    expect(normalizeRole("WM/CHAPLAIN").id).toBe("Ch");
    expect(normalizeRole("wm/chaplain").id).toBe("Ch");
  });

  it("falls through for unknown speakers", () => {
    expect(normalizeRole("Unknown").id).toBe("Unknown");
    expect(normalizeRole("Unknown").display).toBe("Unknown");
  });

  it("populates human-readable display names", () => {
    expect(normalizeRole("WM").display).toBe("Worshipful Master");
    expect(normalizeRole("Tyler").display).toBe("Tiler");
  });
});

describe("buildFromDialogue — shape", () => {
  const plain = parseDialogue(PLAIN);
  const cipher = parseDialogue(CIPHER);
  const doc = buildFromDialogue(plain, cipher, OPTS);

  it("sets format and version", () => {
    expect(doc.format).toBe("MRAM");
    expect(doc.version).toBe(1);
  });

  it("carries metadata through", () => {
    expect(doc.metadata.jurisdiction).toBe("Test Jurisdiction");
    expect(doc.metadata.degree).toBe("Test Degree");
    expect(doc.metadata.ceremony).toBe("Test Ceremony");
    // checksum is not computed by buildFromDialogue (that's encryptMRAM's job)
    expect(doc.metadata.checksum).toBe("");
  });

  it("emits sequential s1, s2, ... section ids", () => {
    expect(doc.sections.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(doc.sections[0].title).toBe("I. Greetings");
    expect(doc.sections[1].title).toBe("II. Closing");
  });

  it("gives every line a unique sequential id", () => {
    const ids = doc.lines.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(Array.from({ length: ids.length }, (_, i) => i + 1));
  });

  it("populates the roles map from used roles", () => {
    expect(doc.roles.WM).toBe("Worshipful Master");
    expect(doc.roles.SW).toBe("Senior Warden");
    expect(doc.roles.JD).toBe("Junior Deacon");
    expect(doc.roles.ALL).toBe("All Brethren");
    expect(doc.roles.Ch).toBe("Chaplain");
  });
});

describe("buildFromDialogue — line kinds", () => {
  const plain = parseDialogue(PLAIN);
  const cipher = parseDialogue(CIPHER);
  const doc = buildFromDialogue(plain, cipher, OPTS);

  it("stores spoken lines with plain + cipher populated and action=null", () => {
    const spoken = doc.lines.filter((l) => l.plain && l.action === null);
    expect(spoken.length).toBeGreaterThan(0);
    const first = spoken[0];
    expect(first.role).toBe("WM");
    expect(first.plain).toBe("Brother Senior Warden, greet the brethren.");
    expect(first.cipher).toBe("Br SW, grt t brn.");
    expect(first.action).toBeNull();
  });

  it("stores action lines with action set and plain/cipher empty", () => {
    const actionLines = doc.lines.filter(
      (l) => l.action !== null && l.role !== CUE_ROLE.id,
    );
    expect(actionLines).toHaveLength(1);
    const [raiseHand] = actionLines;
    expect(raiseHand.role).toBe("SW");
    expect(raiseHand.action).toBe("raises hand");
    expect(raiseHand.plain).toBe("");
    expect(raiseHand.cipher).toBe("");
  });

  it("converts structural cues to CUE-role lines", () => {
    const cueLines = doc.lines.filter((l) => l.role === CUE_ROLE.id);
    expect(cueLines).toHaveLength(3); // [if ...], [else], [end]
    expect(cueLines.map((l) => l.action)).toEqual([
      "if the hall is full",
      "else",
      "end",
    ]);
    expect(cueLines.every((l) => l.plain === "" && l.cipher === "")).toBe(true);
    expect(doc.roles[CUE_ROLE.id]).toBe("Structural Cue");
  });

  it("assigns lines to their parent section", () => {
    const s1Lines = doc.lines.filter((l) => l.section === "s1");
    const s2Lines = doc.lines.filter((l) => l.section === "s2");
    expect(s1Lines.length).toBeGreaterThan(0);
    expect(s2Lines.length).toBeGreaterThan(0);
    expect(s1Lines[0].plain).toBe("Brother Senior Warden, greet the brethren.");
    expect(s2Lines[0].plain).toBe("Brother Junior Deacon, close the door.");
  });

  it("preserves line order from source", () => {
    const plainsInOrder = doc.lines
      .filter((l) => l.plain)
      .map((l) => l.plain);
    expect(plainsInOrder[0]).toContain("greet the brethren");
    expect(plainsInOrder[plainsInOrder.length - 1]).toBe("Amen.");
  });
});

describe("buildFromDialogue — divergent structure", () => {
  it("throws when plain and cipher have different structures", () => {
    const plain = parseDialogue("## S\nA: hi\nB: hello\n");
    const cipher = parseDialogue("## S\nA: h\nA: hlo\n"); // B changed to A
    expect(() => buildFromDialogue(plain, cipher, OPTS)).toThrow(
      /divergent structure/,
    );
  });
});

// ============================================================
// Web Crypto round-trip — the critical cross-compatibility test.
// Proves that an MRAMDocument built from dialogue files can be encrypted
// and decrypted by the same code path the app uses (mram-format.ts).
// ============================================================

describe("web crypto round trip", () => {
  it("encrypts + decrypts back to an equivalent MRAMDocument", async () => {
    const plain = parseDialogue(PLAIN);
    const cipher = parseDialogue(CIPHER);
    const original = buildFromDialogue(plain, cipher, OPTS);

    const passphrase = "test-passphrase-for-vitest";
    const encrypted = await encryptMRAM(original, passphrase);
    const decrypted = await decryptMRAM(encrypted, passphrase);

    // Metadata preserved
    expect(decrypted.format).toBe("MRAM");
    expect(decrypted.version).toBe(1);
    expect(decrypted.metadata.jurisdiction).toBe(OPTS.jurisdiction);
    expect(decrypted.metadata.degree).toBe(OPTS.degree);
    expect(decrypted.metadata.ceremony).toBe(OPTS.ceremony);
    expect(decrypted.metadata.checksum).toBeTruthy();

    // Content preserved line-for-line
    expect(decrypted.sections).toHaveLength(original.sections.length);
    expect(decrypted.lines).toHaveLength(original.lines.length);
    for (let i = 0; i < original.lines.length; i++) {
      const o = original.lines[i];
      const d = decrypted.lines[i];
      expect(d.id).toBe(o.id);
      expect(d.role).toBe(o.role);
      expect(d.section).toBe(o.section);
      expect(d.action).toBe(o.action);
      expect(d.plain).toBe(o.plain);
      expect(d.cipher).toBe(o.cipher);
    }

    // Roles map preserved
    expect(decrypted.roles).toEqual(original.roles);
  });

  it("rejects wrong passphrase", async () => {
    const plain = parseDialogue(PLAIN);
    const cipher = parseDialogue(CIPHER);
    const doc = buildFromDialogue(plain, cipher, OPTS);

    const encrypted = await encryptMRAM(doc, "correct-passphrase");
    await expect(decryptMRAM(encrypted, "wrong-passphrase")).rejects.toThrow();
  });

  it("detects tampering via checksum or auth tag", async () => {
    const plain = parseDialogue(PLAIN);
    const cipher = parseDialogue(CIPHER);
    const doc = buildFromDialogue(plain, cipher, OPTS);

    const encrypted = await encryptMRAM(doc, "test-pass");
    // Flip a byte in the ciphertext portion (after the header)
    const tampered = new Uint8Array(encrypted.slice(0));
    tampered[40] = tampered[40] ^ 0xff;
    await expect(
      decryptMRAM(tampered.buffer, "test-pass"),
    ).rejects.toThrow();
  });
});

// ============================================================
// Cross-runtime crypto compat — THE production path.
// Node-side encryptMRAMNode (from scripts/build-mram-from-dialogue.ts)
// produces a file that the browser-side decryptMRAM must be able to read.
// This test guards against future drift between the two implementations
// (PBKDF2 params, salt/IV size, auth tag placement, AES mode).
// See ~/.claude/skills/aes-gcm-node-web-crypto-interop/SKILL.md for context.
// ============================================================

describe("cross-runtime crypto — Node encrypt → Web Crypto decrypt", () => {
  it("produces a byte layout decryptMRAM can read", async () => {
    const plain = parseDialogue(PLAIN);
    const cipher = parseDialogue(CIPHER);
    const original = buildFromDialogue(plain, cipher, OPTS);

    const passphrase = "cross-runtime-test";
    const encryptedBuffer = encryptMRAMNodeForTest(original, passphrase);
    const decrypted = await decryptMRAM(encryptedBuffer, passphrase);

    expect(decrypted.format).toBe("MRAM");
    expect(decrypted.version).toBe(1);
    expect(decrypted.lines).toHaveLength(original.lines.length);
    expect(decrypted.sections).toHaveLength(original.sections.length);
    expect(decrypted.roles).toEqual(original.roles);

    // Verify checksum survives the round-trip — this is how we know key
    // derivation, IV handling, and auth tag placement all match
    const expectedChecksum = nodeCrypto
      .createHash("sha256")
      .update(JSON.stringify(original.lines))
      .digest("hex");
    expect(decrypted.metadata.checksum).toBe(expectedChecksum);
  });

  it("rejects wrong passphrase on the Node-produced file", async () => {
    const plain = parseDialogue(PLAIN);
    const cipher = parseDialogue(CIPHER);
    const doc = buildFromDialogue(plain, cipher, OPTS);

    const buf = encryptMRAMNodeForTest(doc, "correct");
    await expect(decryptMRAM(buf, "wrong")).rejects.toThrow();
  });
});

// ============================================================
// mramToPlainText CUE cleanup (PR #34a)
//
// The old rendering emitted `**CUE**: [Action: if vouched]` for every
// structural cue, which polluted the AI mentor context with a fake
// speaker. The new rendering emits bare `[if vouched]` without a role
// prefix. Spoken lines render unchanged (regression guard).
// ============================================================

describe("mramToPlainText — CUE cleanup", () => {
  const plain = parseDialogue(PLAIN);
  const cipher = parseDialogue(CIPHER);
  const doc = buildFromDialogue(plain, cipher, OPTS);

  it("emits CUE-role lines as bare bracketed cues without **CUE** prefix", () => {
    const text = mramToPlainText(doc);
    // The PLAIN fixture includes `[if the hall is full]` + `[else]` + `[end]`
    expect(text).toContain("[if the hall is full]");
    expect(text).toContain("[else]");
    expect(text).toContain("[end]");
    // The old format — which we're fixing — would look like `**CUE**:`
    expect(text).not.toMatch(/\*\*CUE\*\*/);
    // And the action-wrapper form is also gone
    expect(text).not.toMatch(/\[Action: if the hall is full\]/);
  });

  it("still renders spoken lines with their speaker prefix (regression)", () => {
    const text = mramToPlainText(doc);
    // The fixture has `WM: Brother Senior Warden...` — spoken line
    // rendering must NOT change from the CUE cleanup. Regression guard.
    expect(text).toContain("**WM**:");
    expect(text).toContain("Brother Senior Warden, greet the brethren.");
    expect(text).toContain("**SW**:");
    expect(text).toContain("Brethren, greetings.");
  });

  it("renders section headers", () => {
    const text = mramToPlainText(doc);
    expect(text).toContain("### I. Greetings");
    expect(text).toContain("### II. Closing");
  });

  it("skips CUE lines that somehow have no action text (defensive)", () => {
    // Manually construct an MRAMDocument with a degenerate CUE line
    // (action: null). The cleanup should silently skip it instead of
    // emitting garbage.
    const mockDoc: MRAMDocument = {
      format: "MRAM",
      version: 1,
      metadata: {
        jurisdiction: "Test",
        degree: "Test",
        ceremony: "Test",
        checksum: "",
      },
      roles: { A: "A", CUE: "Cue" },
      sections: [{ id: "s1", title: "Only Section" }],
      lines: [
        {
          id: 1,
          section: "s1",
          role: "A",
          gavels: 0,
          action: null,
          cipher: "Hi.",
          plain: "Hi.",
        },
        {
          id: 2,
          section: "s1",
          role: "CUE",
          gavels: 0,
          action: null, // degenerate — no cue text
          cipher: "",
          plain: "",
        },
        {
          id: 3,
          section: "s1",
          role: "A",
          gavels: 0,
          action: null,
          cipher: "Bye.",
          plain: "Bye.",
        },
      ],
    };
    const text = mramToPlainText(mockDoc);
    expect(text).toContain("**A**: Hi.");
    expect(text).toContain("**A**: Bye.");
    // The degenerate CUE line should NOT appear as `[]` or `[null]` or similar
    expect(text).not.toMatch(/\[\]/);
    expect(text).not.toMatch(/\[null\]/);
    expect(text).not.toMatch(/\*\*CUE\*\*/);
  });
});

// ============================================================
// Frontmatter integration with build (PR #34a)
//
// When parseDialogue extracts metadata from a plain file, the build
// script reads it instead of the hardcoded default. The builder itself
// takes explicit BuildOptions, so we just verify parseDialogue + the
// builder call-site work together end-to-end.
// ============================================================

describe("buildFromDialogue — gavel cue routing", () => {
  it("transforms [gavels: 3] cue into a CUE-role MRAMLine with gavels=3", () => {
    const plainSrc = `## I. S\nA: hi\n[gavels: 3]\nB: bye\n`;
    const cipherSrc = `## I. S\nA: h\n[gavels: 3]\nB: b\n`;
    const plain = parseDialogue(plainSrc);
    const cipher = parseDialogue(cipherSrc);
    const doc = buildFromDialogue(plain, cipher, OPTS);

    const gavelLine = doc.lines.find((l) => l.gavels > 0);
    expect(gavelLine).toBeDefined();
    expect(gavelLine!.gavels).toBe(3);
    expect(gavelLine!.role).toBe("CUE");
    expect(gavelLine!.action).toBeNull(); // gavels have no action text
    expect(gavelLine!.plain).toBe("");
    expect(gavelLine!.cipher).toBe("");
  });

  it("elides [gavels: 0] cue (zero knocks is a no-op)", () => {
    const plainSrc = `## I. S\nA: hi\n[gavels: 0]\nB: bye\n`;
    const cipherSrc = `## I. S\nA: h\n[gavels: 0]\nB: b\n`;
    const plain = parseDialogue(plainSrc);
    const cipher = parseDialogue(cipherSrc);
    const doc = buildFromDialogue(plain, cipher, OPTS);

    // No line should have gavels > 0, and the gavels: 0 cue should not
    // appear as a CUE-role line at all (elided)
    expect(doc.lines.find((l) => l.gavels > 0)).toBeUndefined();
  });

  it("preserves non-gavel structural cues alongside gavel cues", () => {
    const plainSrc = `## I. S\n[gavels: 1]\nA: hi\n[if morning]\nA: good morning\n[end]\n`;
    const cipherSrc = `## I. S\n[gavels: 1]\nA: h\n[if morning]\nA: gm\n[end]\n`;
    const plain = parseDialogue(plainSrc);
    const cipher = parseDialogue(cipherSrc);
    const doc = buildFromDialogue(plain, cipher, OPTS);

    const gavelLines = doc.lines.filter((l) => l.gavels > 0);
    const actionCues = doc.lines.filter((l) => l.action !== null);
    expect(gavelLines).toHaveLength(1);
    expect(gavelLines[0].gavels).toBe(1);
    // The "if morning" and "end" cues still have action text
    expect(actionCues.some((l) => l.action === "if morning")).toBe(true);
    expect(actionCues.some((l) => l.action === "end")).toBe(true);
  });

  it("handles multiple gavel cues in the same section", () => {
    const plainSrc = `## I. S\n[gavels: 1]\nA: hi\n[gavels: 3]\nB: bye\n`;
    const cipherSrc = `## I. S\n[gavels: 1]\nA: h\n[gavels: 3]\nB: b\n`;
    const plain = parseDialogue(plainSrc);
    const cipher = parseDialogue(cipherSrc);
    const doc = buildFromDialogue(plain, cipher, OPTS);

    const gavelLines = doc.lines.filter((l) => l.gavels > 0);
    expect(gavelLines).toHaveLength(2);
    expect(gavelLines[0].gavels).toBe(1);
    expect(gavelLines[1].gavels).toBe(3);
  });
});

describe("frontmatter → buildFromDialogue integration", () => {
  it("builds with metadata derived from plain frontmatter", () => {
    const plainWithFm = `---
jurisdiction: Custom Jurisdiction
degree: Custom Degree
ceremony: Custom Ceremony
---

## I. Greetings

A: Hello.
B: Hi.
`;
    const cipherNoFm = `## I. Greetings

A: H.
B: H.
`;
    const plain = parseDialogue(plainWithFm);
    const cipher = parseDialogue(cipherNoFm);

    expect(plain.metadata?.jurisdiction).toBe("Custom Jurisdiction");
    expect(cipher.metadata).toBeUndefined();

    // Build using metadata from plain — simulating the CLI script flow
    const doc = buildFromDialogue(plain, cipher, {
      jurisdiction: plain.metadata!.jurisdiction!,
      degree: plain.metadata!.degree!,
      ceremony: plain.metadata!.ceremony!,
    });

    expect(doc.metadata.jurisdiction).toBe("Custom Jurisdiction");
    expect(doc.metadata.degree).toBe("Custom Degree");
    expect(doc.metadata.ceremony).toBe("Custom Ceremony");
  });
});
