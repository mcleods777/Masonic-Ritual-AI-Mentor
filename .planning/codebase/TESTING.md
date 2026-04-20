# Testing Patterns

**Analysis Date:** 2026-04-20

## Test Framework

**Runner:**
- **Vitest** `^4.1.2` (ESM-native, Jest-compatible API).
- Config: `vitest.config.ts`.
- Environment: **jsdom** (`environment: "jsdom"`) globally — use per-file `// @vitest-environment node` pragma when a test needs Node APIs (e.g. `src/lib/__tests__/auth.test.ts:1`).
- Globals enabled (`globals: true`) — `describe` / `it` / `expect` available without import, but the codebase still **explicitly imports them** from `vitest` for clarity.

**Assertion Library:**
- Built-in Vitest `expect` (Jest-API-compatible).
- `@testing-library/jest-dom` `^6.9.1` available for DOM matchers but rarely needed — component tests assert on mock call shapes, not rendered DOM text.

**React testing:**
- `@testing-library/react` `^16.3.2` with `render`, `cleanup`.
- `act` imported directly from `react` (React 19 pattern) — `import { act } from "react";` not from `react-dom/test-utils`.

**Run Commands:**
```bash
npm run test          # vitest — watch mode
npm run test:run      # vitest run — single-pass, CI mode
npm run lint          # eslint
```

## Test File Organization

**Location:**
- **Co-located in `__tests__/` subdirectories** next to the source they cover.
- Library tests: `src/lib/__tests__/*.test.ts`.
- Component tests: `src/components/__tests__/*.test.tsx`.
- `vitest.config.ts:8` also whitelists a top-level `tests/**` directory, but it is **not currently in use** (does not exist in the tree).

**Naming:**
- `<module-name>.test.ts` — same base name as the source file (`text-comparison.ts` → `text-comparison.test.ts`).
- `.tsx` extension reserved for tests that render React (`silent-preload.test.tsx`).
- One `.spec.ts` file is NOT used — always `.test.ts` / `.test.tsx`.

**Existing test inventory (project tests, excluding node_modules / gstack):**
```
src/lib/__tests__/
├── api-fetch.test.ts              — fetch wrapper header injection
├── audio-utils.test.ts            — normalizeAudio / encodeWav WAV encoder
├── auth.test.ts                   — JWT sign/verify + allowlist (NODE env)
├── dialogue-format.test.ts        — dialogue parsing / serialization round-trip
├── dialogue-to-mram.test.ts       — build+encrypt+decrypt round-trip (uses node:crypto)
├── mram-audio-bake.test.ts        — v3 MRAM audio-field carry-through
├── rehearsal-decision.test.ts     — decideLineAction / planComparisonAction
├── styles.test.ts                 — Gemini audio-tag regex
├── text-comparison.test.ts        — 5-layer recitation comparison pipeline
├── tts-fallback.test.ts           — TTS engine selection + error tracking
├── tts-role-assignment.test.ts    — voice-to-role group mapping
├── voice-cast.test.ts             — VoiceCast preamble assembly
└── voice-export-import.test.ts    — voice .json import validation

src/components/__tests__/
└── silent-preload.test.tsx        — ListenMode silent preload effect
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { thingUnderTest } from "../thing";

describe("thingUnderTest — one-line topic", () => {
  it("describes a single behavior in prose", () => {
    expect(thingUnderTest(input)).toBe(expected);
  });
});

// For multi-aspect modules, stack related describe blocks with
// section-divider comments:
// ============================================================
// Layer 1: Normalization
// ============================================================
describe("normalize", () => { ... });

// ============================================================
// Full comparison pipeline
// ============================================================
describe("compareTexts", () => { ... });
```
Real example: `src/lib/__tests__/text-comparison.test.ts:6-45`.

**Patterns:**
- **Describe sentences are scenarios, not names** — `describe("decideLineAction — regression: empty-text rows don't hang the rehearsal", ...)` in `rehearsal-decision.test.ts:35`. Scenario tests attach the bug history.
- **`it` strings start with a verb** — `"accepts typical addresses"`, `"rejects expired token"`, `"routes to judge on NaN accuracy"`. Sentence case.
- **Setup uses `beforeEach` to snapshot + restore env** for any test that mutates `process.env`. See `src/lib/__tests__/auth.test.ts:27-41` — stashes `originalSecret`, restores in `afterEach`.
- **Cleanup for React tests:** `afterEach(() => { cleanup(); vi.useRealTimers(); })` — see `silent-preload.test.tsx:78-81`.

## Mocking

**Framework:** `vi` (Vitest built-in) — `vi.fn`, `vi.mock`, `vi.stubGlobal`, `vi.useFakeTimers`, `vi.resetModules`, `vi.importActual`.

**Module mocking pattern (partial mocks preserve real exports):**
```typescript
vi.mock("@/lib/tts-cloud", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tts-cloud")>("@/lib/tts-cloud");
  return {
    ...actual,
    preloadGeminiRitual: (...args: unknown[]) => {
      preloadMock(...args);
      return { abort: abortMock, done: Promise.resolve() };
    },
    VOXTRAL_ROLE_OPTIONS: [],
  };
});
```
Full example: `src/components/__tests__/silent-preload.test.tsx:24-50`.

**Global stubbing pattern** (for `fetch`, `localStorage`, `Element.prototype.scrollIntoView`):
```typescript
// fetch spy
const originalFetch = globalThis.fetch;
const fetchSpy = vi.fn().mockResolvedValue(new Response("ok"));
globalThis.fetch = fetchSpy;
// ...restore in afterEach
globalThis.fetch = originalFetch;
```
See `src/lib/__tests__/api-fetch.test.ts:4-18`.

```typescript
// localStorage via vi.stubGlobal
const store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
});
```
See `src/lib/__tests__/tts-fallback.test.ts:25-31`.

```typescript
// jsdom gaps — patch in-place only if missing
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
```
See `silent-preload.test.tsx:16-18`.

**`vi.resetModules()`** called in `beforeEach` whenever the module-under-test caches env vars at import time — forces a clean re-import per case. See `api-fetch.test.ts:8`.

**Fake timers:**
- `vi.useFakeTimers()` in `beforeEach`, `vi.useRealTimers()` in `afterEach`.
- Advance with `vi.advanceTimersByTime(ms)` inside an `act(() => { ... })` block for React tests.
- Real-world use: asserting the 2.5s preload delay in `ListenMode` — `silent-preload.test.tsx:120-136`.

**What to Mock:**
- External SDKs and network — `fetch`, `Resend`, Gemini/Groq/Mistral HTTPS endpoints.
- Browser-only APIs that jsdom doesn't ship — `scrollIntoView`, `localStorage`, `IndexedDB` (when exercised).
- Audio subsystem — `gavel-sound`, `text-to-speech` are stubbed wholesale in component tests.
- `preloadGeminiRitual` — mocked so tests don't try to open IndexedDB or call the Gemini API.

**What NOT to Mock:**
- **Pure logic** — `compareTexts`, `decideLineAction`, `planComparisonAction`, `buildPreamble`, `roleToGroup`, `validateVoiceImport`. These are tested with real inputs and real outputs.
- **Crypto (`jose`, `node:crypto`)** — tests use real signing / verification to catch algorithm regressions. See `auth.test.ts:123-130` crafting an expired token with the actual `SignJWT` class.
- **Round-trip boundary code** — `dialogue-to-mram.test.ts:20-50` reimplements the Node-side encryptor in the test file to verify `decryptMRAM` accepts the exact binary layout the CLI script produces.

## Fixtures and Factories

**Inline factory functions** — `makeVoice`, `makeExportJson`, `makeSection`, `makeDoc`. No shared `fixtures/` directory.

Pattern:
```typescript
function makeVoice(overrides: Partial<LocalVoice> = {}): LocalVoice {
  return {
    id: `voice-${Date.now()}-test`,
    name: "Test Voice",
    audioBase64: "dGVzdA==",
    mimeType: "audio/wav",
    duration: 5,
    createdAt: Date.now(),
    ...overrides,
  };
}
```
See `src/lib/__tests__/voice-export-import.test.ts:4-14` and `silent-preload.test.tsx:53-69`.

**Synthetic fixtures for ritual content** — never import real ritual text (gitignored). Test files construct minimal, clearly-fake content (`"A: Hello, friend."`, `"Brother Senior Warden, all present are Masons."`). See header comment at `dialogue-format.test.ts:11-12`.

**Test-only reset hooks exported from source** — `__resetRateLimitForTests()` in `src/lib/rate-limit.ts:71`. Double-underscore prefix signals "production callers stay away."

## Coverage

**Requirements:** **None enforced.** No `coverage` threshold in `vitest.config.ts`, no `--coverage` flag in package.json scripts, no CI coverage gate.

**View Coverage:**
```bash
npx vitest run --coverage  # ad-hoc coverage report (c8/v8 via vitest)
```
Output lands in `/coverage` (already in `.gitignore:12`).

**De-facto scope:**
- Library pure logic has the strongest coverage — `text-comparison`, `rehearsal-decision`, `auth`, `dialogue-format` have dense spec files.
- Component coverage is intentionally narrow — only the silent-preload effect is unit-tested at the component level. Interactive flows are validated manually or via gstack `/qa`.
- API route handlers (`src/app/api/**/route.ts`) are **not unit-tested** — they're validated by end-to-end manual testing and CSO / eng-review audits referenced in source comments.

## Test Types

**Unit Tests:**
- Primary test type. Pure functions called with inputs, output asserted with `toBe` / `toEqual` / `toBeCloseTo` / `toContain`.
- Examples: every file in `src/lib/__tests__/`.

**Integration Tests:**
- A handful of round-trip tests cross module boundaries without mocks:
  - `dialogue-to-mram.test.ts` — parses dialogue → builds MRAM → encrypts with `node:crypto` → decrypts with Web-Crypto `decryptMRAM`. Validates that the CLI script's binary output matches what the browser expects.
  - `auth.test.ts` — signs a magic-link token → presents it as a session token → asserts the audience guard rejects it (`auth.test.ts:149-153`).
- No dedicated integration folder; these live alongside unit tests.

**Component Tests:**
- Single example: `silent-preload.test.tsx`. Renders `<ListenMode>` with mocked dependencies, advances fake timers, asserts the mocked `preloadGeminiRitual` is called with the right filtered argument list.
- React 19 + `@testing-library/react` + `act` from `react`.

**E2E Tests:**
- **None in this repo.** No Playwright, Cypress, or Puppeteer.
- Manual QA flow documented under `docs/BAKE-WORKFLOW.md`; gstack `/qa` and `/review` skills cover visual regressions.

## Common Patterns

**Async Testing:**
```typescript
it("round-trips a valid token", async () => {
  const token = await signMagicLinkToken("brother.one@example.com");
  const payload = await verifyMagicLinkToken(token);
  expect(payload?.email).toBe("brother.one@example.com");
});
```
From `src/lib/__tests__/auth.test.ts:108-112`. Always `async` + `await`; never `.then()` chains.

**Boundary / Edge-case testing (first-class):**
```typescript
it("auto-advances exactly at the threshold (boundary condition)", () => {
  // 95.0 is the smallest value that should auto-advance
  const action = planComparisonAction(95.0, 10);
  expect(action.kind).toBe("auto-advance");
});

it("routes to judge just below the threshold", () => {
  // 94.9 is the largest value that should NOT auto-advance
  const action = planComparisonAction(94.9, 10);
  expect(action.kind).toBe("judge");
});
```
From `rehearsal-decision.test.ts:133-148`. Every threshold value gets ≥3 cases: at, just above, just below.

**Defensive handling tested explicitly:**
```typescript
it("routes to judge on NaN accuracy (never silently auto-advance on broken comparison)", () => {
  const action = planComparisonAction(NaN, 0);
  expect(action.kind).toBe("judge");
});
```
From `rehearsal-decision.test.ts:172-175`. `NaN`, `Infinity`, `-Infinity`, negative numbers all get their own case.

**Regression locks:**
- When a bug is fixed, a new `describe` block is added whose name explains the regression — `describe("decideLineAction — regression: empty-text rows don't hang the rehearsal", ...)` at `rehearsal-decision.test.ts:35`. The comment above lists which cipher stored the bug so the future reader can recognize the same shape.

**Discriminated-union narrowing in assertions:**
```typescript
const result = validateVoiceImport(json);
expect(result.valid).toBe(true);
if (result.valid) expect(result.voices).toHaveLength(1);
```
From `voice-export-import.test.ts:31-35`. Guard then narrow — mirrors the runtime API contract.

**Error-path testing:**
- Test both the happy path AND the three most likely malformed inputs.
- For each exported validator, tests cover: valid input, malformed JSON, wrong version, missing required field. See `voice-export-import.test.ts` — 13 cases for one function.

---

*Testing analysis: 2026-04-20*
