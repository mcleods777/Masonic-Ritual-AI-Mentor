# Voice Maps — Canonical Reference

The single source of truth for which voice each Masonic role gets on every supported TTS engine. All voices are male — Masonry is a men's fraternity, and female voices are never appropriate in ritual, lecture, narrator, or feedback audio. If you change a mapping, change it here and in the matching table in `src/lib/tts-cloud.ts`.

Source of truth in code:
- `GEMINI_ROLE_VOICES` — `src/lib/tts-cloud.ts:1023`
- `ELEVENLABS_ROLE_VOICES` — `src/lib/tts-cloud.ts:104`
- `GOOGLE_ROLE_VOICES` — `src/lib/tts-cloud.ts:258`
- `DEEPGRAM_ROLE_VOICES` — `src/lib/tts-cloud.ts:400`
- `KOKORO_ROLE_VOICES` — `src/lib/tts-cloud.ts:533`
- `VOXTRAL_ROLE_GROUPS` — `src/lib/tts-cloud.ts:714` (groups, not a voice map — see "Voxtral" section)
- Browser Web Speech picks the best available male voice per device via `findBestMaleVoice()` in `src/lib/text-to-speech.ts:216` — no static table.

---

## Gender guardrails (Gemini)

Gemini is the default engine, and its published voice roster mixes male and female voices. Three guardrails keep female voices out:

1. **`GEMINI_ROLE_VOICES`** — every Masonic role maps to a verified-male voice.
2. **`GEMINI_MALE_FALLBACK_VOICE = "Enceladus"`** — any code path that needs a voice but has no role-specific mapping uses this (unknown roles, generic `speak()` for feedback/corrections, stale cache keys, etc.). See `src/lib/tts-cloud.ts:1046`.
3. **`ensureMaleGeminiVoice()` sanitizer** — runs at the entry to `speakGemini()` and rewrites any known-female voice name to the male fallback. Denylist lives at `src/lib/tts-cloud.ts:1055`.

Known female Gemini voices (denied): Kore, Zephyr, Aoede, Callirrhoe, Autonoe, Despina, Erinome, Laomedeia, Leda, Pulcherrima, Sulafat, Vindemiatrix, Achernar, Gacrux.

Test coverage: `src/lib/__tests__/tts-role-assignment.test.ts` fails if any role — mapped, aliased, or unmapped — resolves to a voice in the female denylist.

### If you add a new Gemini voice

Before adding a voice to `GEMINI_ROLE_VOICES` or `groupDefaults`, verify it is **male** via Google's published roster: https://docs.cloud.google.com/text-to-speech/docs/gemini-tts. If it's female, add it to `GEMINI_FEMALE_VOICES` instead so the sanitizer catches any accidental use.

---

## Gemini 3.1 Flash TTS

| Role | Voice | Character |
|---|---|---|
| WM | Alnilam | Firm, strong — authority of the Master |
| SW | Charon | Calm, professional — principal officer |
| JW | Enceladus | Deeper, weighted — authority of station |
| SD | Algenib | Gravelly, masculine — carries orders |
| JD | Orus | Firm, decisive — gate-keeper |
| Sec | Iapetus | Clear, articulate — record-keeper |
| Trs | Schedar | Measured, steady — treasurer |
| Ch | Achird | Friendly, approachable — prayers land warm |
| Marshal | Fenrir | Excitable, dynamic — enforcer / Tyler |
| Steward | Rasalgethi | Distinctive — attendant role |
| Candidate | Zubenelgenubi | Distinctive — new brother |
| Narrator | Enceladus | Breathy, soft — scene-setter |
| *(unmapped)* | Enceladus | Safe fallback — see guardrails |

---

## ElevenLabs

Uses the publicly-available premade voices so every account has them.

| Role | Voice | Voice ID |
|---|---|---|
| WM, ALL, SW/WM | Adam | `pNInz6obpgDQGcFmaJgB` |
| SW | Brian | `nPczCjzI2devNBz1zQrb` |
| JW | George | `JBFqnCBsd6RMkjVDRZzb` |
| SD, S(orJ)D, S/J D | Eric | `cjVigY5qzO86Huf0OWal` |
| JD | Chris | `iP95p4xoKVk53GoZ742B` |
| Sec, S/Sec, S | Bill | `pqHfZKP75CvOlQylNhV4` |
| Tr, Treas, Trs | Charlie | `IKne3meq5aSn9XLyUdCD` |
| Ch, Chap, PRAYER, Prayer, WM/Chaplain | Daniel | `onwK4e9ZLuTAKqWW03F9` |
| Marshal | Liam | `TX3LPaxmHKxFdv7VOQHJ` |
| T, Tyler | Roger | `CwhRBWXzGAHq8TQ4Fs17` |
| Candidate, BR, Bro | Callum | `N2lVS1w4EtoT3dr4eOWO` |
| Voucher, Vchr | Will | `bIHbv24MWmeRgasZH58o` |
| Narrator | Harry | `SOYHLrjzK2X1ezoPC6cr` |
| *(default)* | Adam | `pNInz6obpgDQGcFmaJgB` |

---

## Google Cloud Neural2

The letter suffix indicates gender: `A, B, D, I, J` are male. `C, E, F, G, H` are female and must not appear below.

| Role | Voice | Pitch | Rate |
|---|---|---|---|
| WM | en-US-Neural2-D | -2.0 | 0.90 |
| SW | en-US-Neural2-A | -1.0 | 0.93 |
| JW | en-US-Neural2-J | 0.0 | 0.93 |
| SD | en-US-Neural2-I | 1.0 | 0.97 |
| JD | en-GB-Neural2-B | 0.0 | 0.97 |
| Sec, S/Sec, S | en-US-Neural2-A | 0.0 | 1.0 |
| Tr, Treas, Trs | en-US-Neural2-J | -1.0 | 0.95 |
| Ch, Chap, PRAYER, Prayer, WM/Chaplain | en-US-Neural2-D | -3.0 | 0.85 |
| Marshal | en-US-Neural2-I | -1.0 | 0.95 |
| T, Tyler | en-GB-Neural2-B | 2.0 | 1.0 |
| Candidate | en-US-Neural2-A | 1.0 | 0.90 |
| ALL, SW/WM | en-US-Neural2-D | -1.0 to -1.5 | 0.88-0.90 |
| BR, Bro, Voucher, Vchr | en-US-Neural2-I | 0.0 | 0.95 |
| Narrator | en-US-Neural2-A | 0.0 | 1.0 |
| *(default)* | en-US-Neural2-D | 0.0 | 1.0 |

---

## Deepgram Aura-2

| Role | Voice |
|---|---|
| WM, ALL, SW/WM | aura-2-zeus-en |
| SW, Sec, S/Sec, S, Narrator | aura-2-orion-en |
| JW, Tr, Treas, Trs, Candidate | aura-2-arcas-en |
| SD, S(orJ)D, S/J D, Marshal, BR, Bro, Voucher, Vchr | aura-2-orpheus-en |
| JD | aura-2-apollo-en |
| Ch, Chap, PRAYER, Prayer, WM/Chaplain | aura-2-hermes-en |
| T, Tyler | aura-2-atlas-en |
| *(default)* | aura-2-orion-en |

---

## Kokoro

Prefix indicates origin: `bm_` = British male, `am_` = American male.

| Role | Voice | Speed |
|---|---|---|
| WM, ALL, SW/WM | bm_george | 0.88-0.90 |
| SW, Sec, S/Sec, S | am_adam | 0.93-1.0 |
| JW, Tr, Treas, Trs, Candidate | am_michael | 0.90-0.95 |
| SD, S(orJ)D, S/J D, Voucher, Vchr | bm_daniel | 0.95-0.97 |
| JD, BR, Bro, Marshal | bm_lewis | 0.95-0.97 |
| Ch, Chap, PRAYER, Prayer | bm_george | 0.85 |
| T, Tyler | bm_lewis | 1.0 |
| *(default)* | am_adam | 1.0 |

---

## Voxtral (Mistral)

Voxtral is different from the other engines: there's no static voice map. Instead, every voice is a user-recorded clone stored in IndexedDB, and roles are bucketed into **role groups**. A voice assigned to any role in a group plays for every role in that group; unassigned voices are distributed round-robin.

Role groups (see `VOXTRAL_ROLE_GROUPS` in `src/lib/tts-cloud.ts:714`):

| Group | Roles |
|---|---|
| 0 | WM, W.M., W. M., ALL, All, SW/WM, WM/Chaplain |
| 1 | SW, S.W., S. W. |
| 2 | JW, J.W., J. W. |
| 3 | SD, S.D., S. D., S(orJ)D, S/J D |
| 4 | JD, J.D., J. D. |
| 5 | S/Sec, Sec, Sec., S |
| 6 | Ch, Chap, Chap., PRAYER, Prayer |
| 7 | Tr, Treas, Treas., Trs |
| 8 | Marshal, T, Tyler |
| 9 | Candidate, C, BR, Bro, Bro., Voucher, Vchr |
| 10 | Steward, SS, JS |
| 11 | Narrator |

Voxtral per-role override also applies to other engines: if a Brother records a voice and assigns it to a role, that clone plays for that role regardless of the currently-selected engine. See `speakAsRole()` in `src/lib/text-to-speech.ts:428`.

---

## Browser Web Speech

No static table — voices vary by device. `findBestMaleVoice()` in `src/lib/text-to-speech.ts:216` scores available voices using a male-name list (David, Mark, James, Daniel, Alex, …) and a female-name list (Zira, Samantha, Karen, Moira, …) then picks the highest male score. Falls back to `voices[0]` if no male voice is found on the device — this is the weakest guardrail in the stack, so prefer any cloud engine when gender consistency matters.

---

## Baked audio caveat

`.mram` files can ship pre-rendered Opus audio bytes baked into each line (`section.audio`). Those bytes bypass the voice map entirely — they play whatever voice was selected at bake time. If the voice map changes (e.g., a role previously mapped to a female voice is corrected), old `.mram` files still play the old voice until re-baked. Re-run the matching degree script to refresh:

- EA (first degree): `scripts/bake-first-degree.ts`
- FC (second degree): `scripts/bake-second-degree.ts` *(when added)*
- MM (third degree): `scripts/bake-third-degree.ts` *(when added)*

Cache invalidation for the live-rendered (non-embedded) path is automatic — the cache key hashes `(text, style, voice)`, so changing the voice for a role produces a fresh cache entry.
