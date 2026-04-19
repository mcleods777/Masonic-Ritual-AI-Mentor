# Masonic Ritual AI Mentor

## Your Private, Voice-Driven Practice Companion

Upload your encrypted ritual file. Practice solo, listen to full ceremonies, rehearse your role with AI officers, and get instant word-by-word feedback — all while keeping your ritual secure with military-grade encryption.

---

## App Overview

```mermaid
flowchart TB
    subgraph Browser["Your Browser — Everything Stays Local"]
        Upload["Upload .mram File\nEnter lodge passphrase"]
        Decrypt["Decrypt & Validate\nMagic bytes + checksum"]
        Split["Separate Cipher / Plain\nCipher shown - Plain for AI"]
        Encrypt["Re-encrypt AES-256-GCM\nStore in IndexedDB"]
        Upload --> Decrypt --> Split --> Encrypt

        Solo["Solo Practice\nDrill one section\nCipher text shown"]
        Listen["Listen Mode\nHear full ceremony\nCipher text shown"]
        Rehearsal["Rehearsal Mode\nPractice your role\nCipher text shown"]
        Voices["Custom Voices\nRecord & clone\nStored locally"]
        Encrypt --> Solo
        Encrypt --> Listen
        Encrypt --> Rehearsal
    end

    subgraph Cloud["Cloud Services — Optional"]
        Gemini["Gemini 3.1 Flash TTS\nDefault engine\n3-model fallback"]
        Voxtral["Voxtral (Mistral)\nVoice cloning TTS\nref_audio cloning"]
        Llama["Llama 3.3 (Groq)\nRehearsal feedback\nPlain text only"]
        Whisper["Groq Whisper\nSpeech-to-text"]
    end

    Rehearsal --> Llama
    Rehearsal --> Whisper
    Voices --> Voxtral
    Listen --> Gemini
    Listen --> Voxtral

    style Browser fill:#0f172a,stroke:#334155,color:#e2e8f0
    style Cloud fill:#1e1b2e,stroke:#4c1d95,color:#e2e8f0
```

---

# Getting Started

---

## 1. Install the App

> **You'll need:** Node.js 18+ and a Groq API key ([get one free here](https://console.groq.com/)). Everything else is optional.

```bash
git clone https://github.com/mcleods777/masonic-ritual-ai-mentor.git
cd masonic-ritual-ai-mentor
npm install
cp .env.example .env
```

Add your API keys to `.env`:

```
# Required — AI feedback + speech-to-text
GROQ_API_KEY=gsk_your-key-here

# TTS engines — Gemini is the default; rest are fallbacks or alternatives
GOOGLE_GEMINI_API_KEY=           # Gemini 3.1 Flash TTS — default playback engine
MISTRAL_API_KEY=                 # Voxtral — voice cloning
DEEPGRAM_API_KEY=                # Aura-2 — fast, natural
ELEVENLABS_API_KEY=              # Premium — ultra-realistic
GOOGLE_CLOUD_TTS_API_KEY=        # Neural2 voices
KOKORO_TTS_URL=                  # Self-hosted, free
```

Launch:

```bash
npm run dev
```

> Open **http://localhost:3000** — you're up and running.

---

## 2. Upload Your Ritual

> **Your lodge secretary provides the `.mram` file and passphrase.**

```mermaid
flowchart LR
    A["Drop .mram file"] --> B["Enter passphrase\nPBKDF2 key derivation\n310k iterations"]
    B --> C["Decrypt & validate\nMagic bytes + SHA-256"]
    C --> D["Split cipher / plain\nSeparate encrypted fields"]
    D --> E["Re-encrypt AES-256-GCM\nStore in IndexedDB"]
    E --> F["Original file deleted\nNever stored"]

    style A fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style B fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style C fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style D fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style E fill:#14532d,stroke:#4ade80,color:#e2e8f0
    style F fill:#14532d,stroke:#4ade80,color:#e2e8f0
```

> **Cipher vs. Plain Text**
>
> **Cipher:** `B. S.W., p. t. s. y. t. a. p. a. M.`
> **Plain:** `Brother Senior Warden, proceed to satisfy yourself that all present are Masons.`
>
> You always see cipher text on screen. Plain text is only used behind the scenes for AI feedback and accuracy scoring — never shown, never displayed.

---

---

# Practice Modes

---

## Solo Practice

> **Drill one section at a time until it's perfect.**

```mermaid
flowchart LR
    A["Pick a section\nCipher text shown"] --> B["Recite from memory\nSpeak or type"]
    B --> C["5-layer comparison\nvs. plain text"]
    C --> D["Color-coded results\nWord-by-word diff"]
    D --> E["Hear corrections\nTTS reads back"]
    E -->|"Try again"| B

    style A fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style B fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style C fill:#4c1d95,stroke:#a78bfa,color:#e2e8f0
    style D fill:#4c1d95,stroke:#a78bfa,color:#e2e8f0
    style E fill:#14532d,stroke:#4ade80,color:#e2e8f0
```

**How it works:**

1. Select a section from the dropdown (e.g., "Opening the Lodge")
2. Cipher text appears on screen as your reference
3. Tap the mic or type your lines from memory
4. Hit **Check** — see instant, color-coded feedback

**Reading Your Score**

| Color | What It Means |
|-------|--------------|
| `Green` | **Correct** — nailed it |
| `Red` | **Wrong** — different word |
| `Blue` | **Phonetic match** — right word, speech recognition spelled it differently ("rite" vs "right") |
| `Yellow` | **Fuzzy match** — close enough (minor variation) |
| `Gray` | **Missing** — you skipped this word |

> **How the scoring works — 5-Layer Comparison Pipeline:**

```mermaid
flowchart TD
    Input["Your spoken/typed answer"] --> L1["Layer 1: Normalize\nLowercase, expand contractions,\nstrip filler words (um, uh, like)"]
    L1 --> L2["Layer 2: Word-Level Diff\njsdiff detects insertions,\ndeletions, substitutions"]
    L2 --> L3["Layer 3: Phonetic Forgiveness\nDouble Metaphone catches\nSTT artifacts (rite → right)"]
    L3 --> L4["Layer 4: Fuzzy Tolerance\nLevenshtein distance for\nnear-matches"]
    L4 --> L5["Layer 5: Final Scoring\nColor-coded visual diff"]

    style Input fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style L1 fill:#312e81,stroke:#818cf8,color:#e2e8f0
    style L2 fill:#312e81,stroke:#818cf8,color:#e2e8f0
    style L3 fill:#312e81,stroke:#818cf8,color:#e2e8f0
    style L4 fill:#312e81,stroke:#818cf8,color:#e2e8f0
    style L5 fill:#14532d,stroke:#4ade80,color:#e2e8f0
```

After checking, tap the speaker icon to **hear the correct version** read aloud.

---

## Listen Mode

> **Hear the full ceremony performed with unique AI voices for every officer.**

```mermaid
flowchart TB
    Play["Press Play"] --> Loop{"For each line\nin the ceremony"}
    Loop -->|"Gavel mark"| Knock["Synthesized knock\nDeep woody thump"]
    Loop -->|"Officer line"| Voice["Read aloud with\nthat officer's unique voice"]
    Loop -->|"Stage direction"| Pause["Brief pause\nthen continue"]
    Knock --> Scroll["Script auto-scrolls\nHighlights current line\nCipher text displayed"]
    Voice --> Scroll
    Pause --> Scroll
    Scroll --> Loop

    style Play fill:#14532d,stroke:#4ade80,color:#e2e8f0
    style Loop fill:#4c1d95,stroke:#a78bfa,color:#e2e8f0
    style Knock fill:#78350f,stroke:#fbbf24,color:#e2e8f0
    style Voice fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style Pause fill:#374151,stroke:#9ca3af,color:#e2e8f0
    style Scroll fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
```

**Officer voices (Gemini 3.1 Flash — default engine):**

| Officer | Voice | Character |
|---------|-------|-----------|
| Worshipful Master | Alnilam | Deep, authoritative |
| Senior Warden | Charon | Clear, measured |
| Junior Warden | Algenib | Mid-range, steady |
| Senior Deacon | Fenrir | Smooth, warm |
| Junior Deacon | Crisp, distinct | |
| Chaplain | Reverent, steady | |
| Tyler | Resonant, laid-back | |

Use **Pause / Resume** anytime. Gavel marks produce synthesized knock sounds. Stage directions appear on screen but aren't spoken.

---

## Rehearsal Mode

> **Practice your role while AI reads everyone else's parts.**

```mermaid
flowchart TB
    Pick["Pick your officer role\nWM / SW / JW / SD / JD / etc."] --> Start["Start Rehearsal"]
    Start --> Loop{"Ceremony plays\nline by line"}
    Loop -->|"Other officer's line"| AI["AI reads it aloud\nwith that role's voice"]
    Loop -->|"Your line!"| You["'Your Turn' prompt\nSpeak or type from memory"]
    AI --> Loop
    You --> Score["Line scored instantly\n5-layer comparison\n+ Llama 3.3 feedback"]
    Score --> Loop
    Loop -->|"Ceremony complete"| Results["Final Results\nOverall accuracy %\nLine-by-line breakdown"]

    style Pick fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style Start fill:#14532d,stroke:#4ade80,color:#e2e8f0
    style Loop fill:#4c1d95,stroke:#a78bfa,color:#e2e8f0
    style AI fill:#374151,stroke:#9ca3af,color:#e2e8f0
    style You fill:#78350f,stroke:#fbbf24,color:#e2e8f0
    style Score fill:#4c1d95,stroke:#a78bfa,color:#e2e8f0
    style Results fill:#14532d,stroke:#4ade80,color:#e2e8f0
```

> This is the closest thing to rehearsing with your lodge — without needing anyone else to be there.

After each line, Llama 3.3 on Groq streams short feedback on what you missed and why. Only **plain text** is ever sent — cipher text never leaves your device, and grips/passwords/modes of recognition are never part of the corpus the AI sees.

---

## Custom Voice Cloning

> **Record a brother's voice once. Hear him read lines for rehearsal.**

```mermaid
flowchart LR
    A["Record 3-10s audio\nIn the browser"] --> B["Stored locally\nIndexedDB\nAES-256-GCM"]
    B --> C["Sent as ref_audio\nwith each Voxtral request"]
    C --> D["Voxtral clones voice\nat inference time"]
    D --> E["Plays during rehearsal\nAssigned to officer role"]

    style A fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style B fill:#14532d,stroke:#4ade80,color:#e2e8f0
    style C fill:#4c1d95,stroke:#a78bfa,color:#e2e8f0
    style D fill:#4c1d95,stroke:#a78bfa,color:#e2e8f0
    style E fill:#14532d,stroke:#4ade80,color:#e2e8f0
```

**How to clone a voice:**

1. Go to the **Voices** page
2. Pick an officer role
3. Tap **Record** and read a 10-second prompt (prompts are generic prose, no ritual content)
4. Name it ("Brother McLeod - WM") and save
5. Assign to one or more officer roles

The app ships with **15 default Voxtral character voices** as an unassigned fallback pool. When Gemini is throttled, Voxtral steps in using whatever voices you've assigned, or falls through to the default pool. Record your own voices to personalize; leave them blank and the defaults handle it.

Export/import voice profiles as JSON for backup and cross-device transfer.

---

---

# Voice & Speech Setup

---

## Text-to-Speech Engines

Seven TTS engines. Gemini is the default; the rest are fallbacks or alternatives.

```mermaid
flowchart TB
    Need["App needs to speak a line"] --> Gemini{"Gemini 3.1 Flash TTS\nDefault engine"}
    Gemini -->|"OK"| Play["Audio plays"]
    Gemini -->|"429 / 404"| Fallback["3-model fallback\n3.1-flash → 2.5-flash → 2.5-pro"]
    Fallback -->|"All exhausted"| Voxtral["Voxtral\n15 default voices in pool"]
    Voxtral -->|"Down"| GoogleCloud["Google Cloud Neural2"]
    GoogleCloud -->|"Down"| Browser["Browser TTS\nAlways works"]

    style Need fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style Gemini fill:#4c1d95,stroke:#a78bfa,color:#e2e8f0
    style Fallback fill:#78350f,stroke:#fbbf24,color:#e2e8f0
    style Voxtral fill:#4c1d95,stroke:#a78bfa,color:#e2e8f0
    style GoogleCloud fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style Browser fill:#14532d,stroke:#4ade80,color:#e2e8f0
    style Play fill:#14532d,stroke:#4ade80,color:#e2e8f0
```

| Engine | Type | Voices | Cost |
|--------|------|--------|------|
| **Gemini 3.1 Flash TTS** *(default)* | Cloud, expressive | Per-role male voices (Alnilam, Charon, etc.) with prompt-tag direction | Preview pricing |
| **Voxtral (Mistral)** | Cloud + voice cloning | Clone any voice from 3s audio; 15 default character voices in pool | ~$0.016/1K chars |
| **ElevenLabs** | Cloud | 10 distinct male voices | Premium |
| **Deepgram Aura-2** | Cloud | 7 distinct voices (Zeus, Orion, etc.) | Pay-per-use |
| **Google Cloud TTS** | Cloud | Neural2 voices with pitch control | Pay-per-use |
| **Kokoro** | Self-hosted | Multiple voices, free | Free (self-hosted) |
| **Browser** | Built-in | Pitch/rate differentiation | Free |

### Setting Up Gemini (default)

1. Create a project at [Google AI Studio](https://aistudio.google.com/)
2. Create an API key
3. Add to `.env`:

```
GOOGLE_GEMINI_API_KEY=AIza-your-key-here
```

4. Optional — override the fallback chain at runtime:

```
GEMINI_TTS_MODELS=gemini-3.1-flash-preview-tts,gemini-2.5-flash-preview-tts,gemini-2.5-pro-preview-tts
```

### Setting Up Voxtral (voice cloning)

1. Sign up at [console.mistral.ai](https://console.mistral.ai/)
2. Copy your API key
3. Add to `.env`:

```
MISTRAL_API_KEY=your-key-here
```

4. Record voices on the **Voices** page — zero-shot cloning works on the free tier.

### Setting Up the Rest

Add any of these keys to `.env` to enable them. Each engine shows up in the engine dropdown when its key is present.

```
DEEPGRAM_API_KEY=your-key-here            # Aura-2
ELEVENLABS_API_KEY=your-key-here          # Premium
GOOGLE_CLOUD_TTS_API_KEY=your-key-here    # Neural2
KOKORO_TTS_URL=http://localhost:8880      # Self-hosted
```

---

## Speech-to-Text

| Engine | Accuracy | Setup |
|--------|----------|-------|
| **Groq Whisper** | Excellent — trained with Masonic vocabulary hints | Required for cloud STT |
| **Browser Speech API** | Good for general speech | None — built into Chrome/Edge |

### Setting Up Groq Whisper

> **Recommended** if you find browser speech recognition stumbling on Masonic terms.

1. Sign up at [console.groq.com](https://console.groq.com/)
2. Create an API key
3. Add to `.env`:

```
GROQ_API_KEY=gsk_your-key-here
```

4. Restart the dev server

The same key powers both Whisper STT and Llama 3.3 rehearsal feedback.

---

---

# Creating .mram Files

---

> **For lodge secretaries** or anyone who needs to build ritual files from scratch.

## Input Format — Two Parallel Dialogue Files

The current recommended path uses two parallel markdown files: plain English and cipher. Speaker structure must match line-for-line.

**`rituals/{prefix}-dialogue.md` (plain):**

```markdown
### Opening the Lodge

WM: * Brother Senior Warden, proceed to satisfy yourself that all present are Masons.

SW: * Brothers Senior and Junior Deacons, proceed to satisfy yourselves that all present are Masons.
```

**`rituals/{prefix}-dialogue-cipher.md` (cipher):**

```markdown
### Opening the Lodge

WM: * B. S.W., p. t. s. y. t. a. p. a. M.

SW: * Bros. S. & J.D., p. t. s. y. t. a. p. a. M.
```

## Format Rules

| Element | Syntax | Example |
|---------|--------|---------|
| **Section heading** | `### Title` | `### Opening the Lodge` |
| **Speaker line** | `ROLE: text` | `WM: Brother Senior Warden...` |
| **Gavel mark** | `*` after colon | `WM: * Brother Senior...` |
| **Stage direction** | `[brackets]` or `(parentheses)` | `[Senior Deacon rises]` |
| **Per-line style tags** | `{prefix}-styles.json` sidecar | Optional — Gemini prompt-tag overrides |

## The .mram File Structure

```mermaid
flowchart LR
    subgraph File[".mram Binary File (v3)"]
        Magic["4 bytes\nMRAM"]
        Version["1 byte\nVersion (3)"]
        Salt["16 bytes\nSalt"]
        IV["12 bytes\nIV"]
        Payload["Variable\nAES-256-GCM\nEncrypted JSON"]
    end

    subgraph JSON["Decrypted Payload"]
        Meta["Metadata\nJurisdiction / Degree / Ceremony\nvoiceCast + audioFormat (v3)"]
        Roles["Roles Map\nWM / SW / JD / etc."]
        Sections["Sections\nOrdered ceremony parts"]
        Lines["Lines Array\nCipher + Plain + Role\nGavels + Actions + Style + Audio"]
    end

    Payload -.->|"PBKDF2\n+ passphrase"| JSON

    style File fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style JSON fill:#14532d,stroke:#4ade80,color:#e2e8f0
```

**Format version 3** adds optional per-line Opus audio bytes plus a `voiceCast` map so the client can skip the Gemini API entirely on playback.

## Build Command

```bash
npx tsx scripts/build-mram-from-dialogue.ts \
  rituals/{prefix}-dialogue.md \
  rituals/{prefix}-dialogue-cipher.md \
  rituals/{prefix}.mram
```

Passphrase is prompted interactively — never accepted on the command line.

## Build With Pre-Rendered Audio (recommended for pilot distribution)

```bash
GOOGLE_GEMINI_API_KEY=... \
npx tsx scripts/build-mram-from-dialogue.ts \
  rituals/ea-initiation-dialogue.md \
  rituals/ea-initiation-dialogue-cipher.md \
  rituals/ea-initiation.mram \
  --with-audio
```

The `--with-audio` flag renders every spoken line to Opus (32 kbps mono) via Gemini 3.1 Flash TTS and embeds the audio in the encrypted .mram payload. At playback time, the client plays these bytes directly — **zero Gemini API calls per Brother per rehearsal, ever**.

Requirements:
- `ffmpeg` in PATH (for Opus encoding)
- `GOOGLE_GEMINI_API_KEY` env var
- Your own Gemini quota (the script uses the 3-model fallback chain; on all-models-429 it sleeps until midnight PT and auto-resumes)

Per-line Opus bytes are cached at `~/.cache/masonic-mram-audio/` so interrupted runs resume cleanly. File size grows from ~50 KB to ~6 MB per ritual.

### Convenience wrapper — all 3 EA rituals

```bash
GOOGLE_GEMINI_API_KEY=... npx tsx scripts/bake-ea-rituals.ts
```

Runs ea-opening, ea-initiation, and ea-closing back-to-back with a single passphrase prompt. Use `BAKE_SKIP=ea-closing` to exclude specific rituals.

Share the `.mram` file with lodge members. They'll need the passphrase to open it.

---

---

# Deployment

---

## Vercel (Recommended)

| Step | Action |
|------|--------|
| **1** | Push code to GitHub |
| **2** | Import repo at [vercel.com](https://vercel.com/) |
| **3** | Add environment variables in project settings |
| **4** | Deploy — Vercel handles the rest |

**Required env vars:**

| Variable | Required? | Purpose |
|----------|-----------|---------|
| `GROQ_API_KEY` | Yes | Llama 3.3 feedback + Whisper STT |
| `GOOGLE_GEMINI_API_KEY` | Recommended | Default TTS engine |
| `MISTRAL_API_KEY` | Optional | Voxtral voice cloning |
| `DEEPGRAM_API_KEY` | Optional | Aura-2 TTS |
| `ELEVENLABS_API_KEY` | Optional | Premium TTS |
| `GOOGLE_CLOUD_TTS_API_KEY` | Optional | Neural2 TTS |

## Pilot Auth (Optional)

For lodges running a gated pilot, add magic-link auth:

```
LODGE_ALLOWLIST=brother1@example.com,brother2@example.com
RESEND_API_KEY=your-resend-key
MAGIC_LINK_FROM_EMAIL=pilot@yourlodge.org
MAGIC_LINK_BASE_URL=https://your-pilot-url.vercel.app
```

- Only emails on `LODGE_ALLOWLIST` receive sign-in links
- No passwords, no accounts beyond a session cookie
- Per-IP and per-email rate limiting on link issuance (5/hr per IP, 3/hr per email)
- Session cookie is good for 30 days; sign-in link is good for 24 hours

## Self-Hosting

```bash
npm run build
npm start
```

Runs on port 3000 as a standard Next.js 16 application.

---

---

# Privacy & Security

---

```mermaid
flowchart LR
    subgraph Local["Stays on Your Device"]
        A["Ritual cipher + plain text\nAES-256-GCM encrypted"]
        B["Encryption key\nBrowser-generated"]
        C["Practice scores"]
        D["Voice recordings\nIndexedDB"]
        E["Baked audio from .mram\nPre-rendered, on-device"]
    end

    subgraph Cloud["Sent Externally — Only When Used"]
        F["Llama 3.3 / Groq\nPlain text only"]
        G["Gemini TTS\nPlain text (when not baked)"]
        H["Voxtral\nPlain text + voice sample"]
        I["Groq Whisper\nAudio recording"]
    end

    subgraph Safe["Security Guarantees"]
        J["API keys stay on server"]
        K["No-retention policies on all AI vendors"]
        L["No user accounts or tracking"]
        M[".mram file never stored"]
    end

    style Local fill:#14532d,stroke:#4ade80,color:#e2e8f0
    style Cloud fill:#78350f,stroke:#fbbf24,color:#e2e8f0
    style Safe fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
```

## What Stays on Your Device

| Data | Protection |
|------|-----------|
| Ritual cipher + plain text | AES-256-GCM encrypted, separate fields in IndexedDB |
| Encryption key | Generated by your browser, never transmitted |
| Practice scores | Local browser storage only |
| Voice recordings (Voxtral) | Encrypted IndexedDB, only sent with TTS requests |
| Pre-baked audio (baked .mram) | Played from file, never leaves the device |

## What Goes to the Cloud (Only When Used)

| Service | What's Sent | Data Policy |
|---------|------------|-------------|
| Groq (Llama 3.3) | Plain text only, never cipher | No-retention policy |
| Groq (Whisper) | Audio recording for transcription | No-retention policy |
| Google Gemini TTS | Plain text for speech synthesis | Google AI Studio data terms |
| Voxtral (Mistral) | Plain text + ref_audio sample | Mistral data processing terms |
| Google Cloud TTS | Plain text for speech synthesis | Google Cloud data processing terms |
| Deepgram / ElevenLabs | Plain text for speech synthesis | Vendor data processing terms |

## Security Guarantees

- API keys are server-side only — never exposed to the browser
- PBKDF2 key derivation with **310,000 iterations** (OWASP 2023 standard)
- AES-256-GCM encryption for all stored data
- The `.mram` file is **never stored** — only re-encrypted data is kept
- **No user accounts, no tracking, no analytics**
- Strict CSP, HSTS preload, `X-Frame-Options: DENY`, locked `Permissions-Policy` on every response
- Magic-link auth uses `x-vercel-forwarded-for` for trustworthy IP attribution on rate limits
- Grips, passwords, and modes of recognition are never in the corpus the AI sees

---

---

# Tech Stack

---

## Architecture

```mermaid
flowchart TB
    subgraph Frontend["Frontend — Next.js 16 + React 19"]
        Pages["Pages\nUpload / Practice / Voices\nListen / Rehearsal / Author"]
        Components["Components\nDocumentUpload / PracticeMode\nListenMode / RehearsalMode\nGeminiPreloadPanel / DiffDisplay"]
        Lib["Libraries\nmram-format / storage\ntext-comparison\nspeech-to-text / text-to-speech"]
        Pages --> Components --> Lib
    end

    subgraph API["API Routes — Next.js Server"]
        TTS["/api/tts/*\nGemini + Voxtral + 5 others"]
        STT["/api/transcribe\nGroq Whisper"]
        Feedback["/api/rehearsal-feedback\nLlama 3.3 streaming"]
        Auth["/api/auth/magic-link/*\nJWT + rate-limited"]
        Author["/api/author/*\nLocal-only ritual editor"]
    end

    subgraph Storage["Client Storage"]
        IDB["IndexedDB\nAES-256-GCM encrypted\nCipher + Plain + Audio separated"]
        Crypto["Web Crypto API\nKey generation + encryption"]
    end

    Components --> API
    Components --> Storage
    Lib --> Crypto

    style Frontend fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style API fill:#4c1d95,stroke:#a78bfa,color:#e2e8f0
    style Storage fill:#14532d,stroke:#4ade80,color:#e2e8f0
```

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript |
| **Styling** | Tailwind CSS v4 |
| **AI Feedback** | Llama 3.3 70B on Groq (streaming) |
| **Speech-to-Text** | Groq Whisper Large v3 + Browser Web Speech API |
| **Text-to-Speech** | Gemini 3.1 Flash TTS (default), Voxtral, ElevenLabs, Deepgram Aura-2, Google Cloud TTS, Kokoro, Browser |
| **Voice Cloning** | Voxtral (Mistral) via ref_audio zero-shot cloning |
| **Text Comparison** | jsdiff + Double Metaphone + Levenshtein distance |
| **Encryption** | AES-256-GCM + PBKDF2 (310k iterations) |
| **Local Storage** | IndexedDB with Web Crypto API |
| **Audio Effects** | Web Audio API (synthesized gavel knocks, WAV encoding) |
| **Ritual Format** | `.mram` custom encrypted binary (v3 — with embedded Opus audio) |
| **Auth** | Magic-link (JWT + per-IP/per-email rate limiting) for pilot allowlist |
| **Deployment** | Vercel Fluid Compute |

---

---

# Troubleshooting

---

## "Decryption failed" on upload

- Double-check your lodge passphrase — it's **case-sensitive**
- Ensure the `.mram` file wasn't corrupted during transfer
- Verify you have the right file for your jurisdiction/degree

## Speech recognition not working

- Use **Chrome** or **Edge** for best Web Speech API support
- Grant microphone permission when prompted
- Poor accuracy? Set up **Groq Whisper** for Masonic vocabulary support

## No sound in Listen / Rehearsal mode

- Check device volume and mute settings
- If your .mram was built with `--with-audio`, the audio is embedded — try re-uploading the file to make sure it loaded
- Switch voice engines from the dropdown (Gemini, Voxtral, Browser TTS, etc.)
- Some browsers block autoplay — click a button first to allow audio

## Rehearsal feedback not appearing

- Verify `GROQ_API_KEY` in `.env` is correct
- Check key validity at [console.groq.com](https://console.groq.com/)
- Restart the dev server after any `.env` change

## Gemini voices suddenly sound different

- Gemini TTS preview has a daily quota that resets at midnight Pacific Time
- When exhausted, the route falls back: 3.1-flash → 2.5-flash → 2.5-pro → Voxtral → Google Cloud → Browser
- If you hear a different voice, the fallback fired — add billing to your Gemini project or wait for reset
- Baked .mram files skip this path entirely (audio comes from the file, not the API)

## Voice engines not showing up

- Confirm the API key for that engine is in `.env`
- Restart the dev server (`npm run dev`)
- Check the browser console (F12) for API errors

---

---

# FAQ

---

**Can I use this on my phone?**
Yes. Fully responsive with mobile-optimized navigation. Install as a PWA from Safari (iOS) or Chrome (Android) for a native-app feel.

**Does the AI store my ritual text?**
No. Groq, Google Gemini, Mistral, Deepgram, ElevenLabs, and Google Cloud TTS all have no-retention policies. Text is sent only during active sessions and is not retained. For the pilot, baked .mram files skip the cloud entirely for playback — the audio is already on your device.

**Can I practice offline?**
Solo Practice with Browser TTS works fully offline. Baked .mram files play Listen and Rehearsal audio offline too. The only online-required features are Groq feedback and Whisper STT.

**What degrees are supported?**
Any ceremony formatted as an `.mram` file. The app is ceremony-agnostic. The `/author` page (local-only) is a side-by-side editor for lodge secretaries building or editing rituals.

**How do I share with my lodge?**
Deploy to Vercel (free tier works), share the URL. Distribute the `.mram` file separately (USB stick, direct message). Each member uploads the same `.mram` with the lodge passphrase. No accounts needed unless you want the pilot auth gate.

**Does the AI ever see grips, passwords, or modes of recognition?**
No. Those are not in the plain-text corpus. The AI only sees the plain text of ritual speech. The system prompt further enforces that it never generates or echoes recognition modes.

**Is my data safe?**
Yes. AES-256-GCM encryption, PBKDF2 key derivation (310k iterations), no server-side storage, no tracking. Your ritual stays in your browser. For the pilot, magic-link auth with per-IP/per-email rate limits keeps the allowlist gate tight.
