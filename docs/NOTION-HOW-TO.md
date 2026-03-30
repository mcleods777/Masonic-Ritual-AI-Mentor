# Masonic Ritual AI Mentor

## Your Private, Voice-Driven Practice Companion

Upload your encrypted ritual file. Practice solo, listen to full ceremonies, rehearse your role with AI officers, and get coaching from Claude — all while keeping your ritual secure with military-grade encryption.

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
        Coach["AI Coach\nChat with Claude\nAsk anything"]
        Encrypt --> Solo
        Encrypt --> Listen
        Encrypt --> Rehearsal
        Encrypt --> Coach
    end

    subgraph Cloud["Cloud Services — Optional"]
        Claude["Claude API\nAI Coaching\nPlain text only"]
        Google["Google Cloud TTS\nPremium voices"]
        Eleven["ElevenLabs\nUltra-realistic voices"]
        Groq["Groq Whisper\nSpeech-to-text"]
    end

    Coach --> Claude
    Solo --> Claude
    Rehearsal --> Claude
    Listen --> Google
    Listen --> Eleven
    Rehearsal --> Google
    Solo --> Groq

    style Browser fill:#0f172a,stroke:#334155,color:#e2e8f0
    style Cloud fill:#1e1b2e,stroke:#4c1d95,color:#e2e8f0
```

---

# Getting Started

---

## 1. Install the App

> **You'll need:** Node.js 18+ and an Anthropic API key ([get one here](https://console.anthropic.com/))

```bash
git clone https://github.com/mcleods777/masonic-ritual-ai-mentor.git
cd masonic-ritual-ai-mentor
npm install
cp .env.example .env
```

Add your API key to `.env`:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
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
> You always see cipher text on screen. Plain text is only used behind the scenes for AI coaching and accuracy scoring.

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

**Officer voices:**

| Officer | Voice Character |
|---------|----------------|
| Worshipful Master | Deep, authoritative |
| Senior Warden | Clear, measured |
| Junior Warden | Mid-range, steady |
| Senior Deacon | Slightly brighter |
| Junior Deacon | Crisp, distinct |
| Chaplain | Deepest, slowest |
| Tyler | Higher, distinct |

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
    You --> Score["Line scored instantly\n5-layer comparison"]
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

---

## AI Ritual Coach

> **Chat with Claude about your specific ritual.**

```mermaid
flowchart LR
    Q["Ask a question"] --> Server["Server\nPlain text context only\nCipher never sent"]
    Server --> Claude["Claude AI\nStreaming response"]
    Claude --> A["Answer appears\n+ optional TTS readback"]

    style Q fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style Server fill:#374151,stroke:#9ca3af,color:#e2e8f0
    style Claude fill:#4c1d95,stroke:#a78bfa,color:#e2e8f0
    style A fill:#14532d,stroke:#4ade80,color:#e2e8f0
```

Ask anything:
- *"What does the Senior Warden say after the Worshipful Master's opening?"*
- *"Quiz me on the Junior Deacon's lines in the opening"*
- *"Explain the significance of the first section"*

**Choose your model:**

| Model | Best For |
|-------|---------|
| **Haiku** | Quick questions, fast responses |
| **Sonnet** | Balanced speed and depth |
| **Opus** | Complex questions, detailed explanations |

> **Privacy:** Only plain text is sent to Claude. Cipher text never leaves your device. Anthropic does not train on API data.

> **Masonic Safety:** The AI will **never** reveal grips, passwords, or modes of recognition. This is enforced at the system prompt level.

---

---

# Voice & Speech Setup

---

## Text-to-Speech Engines

Pick the voice quality that works for you:

```mermaid
flowchart TB
    Need["App needs to speak a line\nUses plain text for TTS"] --> Router{"Voice Engine\nRouter"}
    Router -->|"Free"| Browser["Browser TTS\nOn-device, works offline\nPitch/rate varies per role"]
    Router -->|"Premium"| Google["Google Cloud TTS\nNeural2 voices\nDifferent voice per role"]
    Router -->|"Ultra"| Eleven["ElevenLabs\nHuman-like quality\nUnique voice per role"]
    Browser --> Audio["Audio output"]
    Google --> Audio
    Eleven --> Audio

    style Need fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style Router fill:#4c1d95,stroke:#a78bfa,color:#e2e8f0
    style Browser fill:#14532d,stroke:#4ade80,color:#e2e8f0
    style Google fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style Eleven fill:#78350f,stroke:#fbbf24,color:#e2e8f0
    style Audio fill:#374151,stroke:#9ca3af,color:#e2e8f0
```

| Engine | Quality | Cost | Setup |
|--------|---------|------|-------|
| **Browser TTS** | Good | Free | None — works out of the box |
| **Google Cloud TTS** | Premium | Pay-per-use | API key required |
| **ElevenLabs** | Ultra-realistic | Pay-per-use | API key required |

### Setting Up Google Cloud TTS

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Cloud Text-to-Speech API**
3. Go to **APIs & Services** then **Credentials** — create an API key
4. Add to `.env`:

```
GOOGLE_CLOUD_TTS_API_KEY=your-key-here
```

5. Restart the app

### Setting Up ElevenLabs

1. Sign up at [elevenlabs.io](https://elevenlabs.io/)
2. Copy your API key from **Profile**
3. Add to `.env`:

```
ELEVENLABS_API_KEY=your-key-here
```

4. Restart the app

---

## Speech-to-Text

| Engine | Accuracy | Setup |
|--------|----------|-------|
| **Browser Speech API** | Good for general speech | None — built into Chrome/Edge |
| **Groq Whisper** | Excellent — trained with Masonic vocabulary hints | API key required |

### Setting Up Groq Whisper

> **Recommended** if you find browser speech recognition stumbling on Masonic terms.

1. Sign up at [console.groq.com](https://console.groq.com/)
2. Create an API key
3. Add to `.env`:

```
GROQ_API_KEY=your-key-here
```

4. Restart the app

---

---

# Creating .mram Files

---

> **For lodge secretaries** or anyone who needs to build ritual files from scratch.

## Input Format

Create a markdown file where each spoken line appears **twice** — cipher first, then plain:

```markdown
### Opening the Lodge

WM: * Bro. S.W., p. t. s. y. t. a. p. a. M.
WM: * Brother Senior Warden, proceed to satisfy yourself that all present are Masons.

SW: * Bros. S. & J.D., p. t. s. y. t. a. p. a. M.
SW: * Brothers Senior & Junior Deacons, proceed to satisfy yourselves that all present are Masons.
```

## Format Rules

| Element | Syntax | Example |
|---------|--------|---------|
| **Section heading** | `### Title` | `### Opening the Lodge` |
| **Speaker line** | `ROLE: text` | `WM: Brother Senior Warden...` |
| **Gavel mark** | `*` after colon | `WM: * Brother Senior...` |
| **Stage direction** | `(parentheses)` | `(Senior Deacon rises)` |
| **Line pairing** | Cipher first, plain second | See example above |

## The .mram File Structure

```mermaid
flowchart LR
    subgraph File[".mram Binary File"]
        Magic["4 bytes\nMRAM"]
        Version["1 byte\nVersion"]
        Salt["16 bytes\nSalt"]
        IV["12 bytes\nIV"]
        Payload["Variable\nAES-256-GCM\nEncrypted JSON"]
    end

    subgraph JSON["Decrypted Payload"]
        Meta["Metadata\nJurisdiction\nDegree / Ceremony"]
        Roles["Roles Map\nWM / SW / JD / etc."]
        Sections["Sections\nOrdered ceremony parts"]
        Lines["Lines Array\nCipher + Plain + Role\nGavels + Actions"]
    end

    Payload -.->|"PBKDF2\n+ passphrase"| JSON

    style File fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style JSON fill:#14532d,stroke:#4ade80,color:#e2e8f0
```

## Build Command

```bash
npx tsx scripts/build-mram.ts input.md output.mram "YourLodgePassphrase"
```

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

| Variable | Required? |
|----------|-----------|
| `ANTHROPIC_API_KEY` | Yes |
| `GOOGLE_CLOUD_TTS_API_KEY` | No |
| `ELEVENLABS_API_KEY` | No |
| `GROQ_API_KEY` | No |

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
        A["Ritual cipher + plain text\nAES-256 encrypted"]
        B["Encryption key\nBrowser-generated"]
        C["Practice scores"]
        D["Browser speech recognition"]
        E["Browser voice playback"]
    end

    subgraph Cloud["Sent Externally — Only When Used"]
        F["AI Coach → Claude API\nPlain text only"]
        G["Google TTS → plain text"]
        H["ElevenLabs → plain text"]
        I["Groq → audio recording"]
    end

    subgraph Safe["Security Guarantees"]
        J["API keys stay on server"]
        K["Anthropic does not train on API data"]
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
| Browser speech recognition | Processed entirely on-device |
| Browser voice playback | Processed entirely on-device |

## What Goes to the Cloud (Only When Used)

| Service | What's Sent | Data Policy |
|---------|------------|-------------|
| Claude API (AI Coach) | Plain text only, never cipher | Anthropic does not train on API data |
| Google Cloud TTS | Plain text for speech synthesis | Google Cloud data processing terms |
| ElevenLabs TTS | Plain text for speech synthesis | ElevenLabs data processing terms |
| Groq Whisper | Audio recording for transcription | Groq data processing terms |

## Security Guarantees

- API keys are server-side only — never exposed to the browser
- PBKDF2 key derivation with **310,000 iterations** (OWASP 2023 standard)
- AES-256-GCM encryption for all stored data
- The `.mram` file is **never stored** — only re-encrypted data is kept
- **No user accounts, no tracking, no analytics**

---

---

# Tech Stack

---

## Architecture

```mermaid
flowchart TB
    subgraph Frontend["Frontend — Next.js 16 + React 19"]
        Pages["Pages\nUpload / Practice / Chat\nListen / Rehearsal"]
        Components["Components\nDocumentUpload / PracticeMode\nListenMode / RehearsalMode\nChatInterface / DiffDisplay"]
        Lib["Libraries\nmram-format / storage\ntext-comparison\nspeech-to-text / text-to-speech"]
        Pages --> Components --> Lib
    end

    subgraph API["API Routes — Next.js Server"]
        Chat["/api/chat\nClaude streaming"]
        TTS["/api/tts/*\nGoogle + ElevenLabs"]
        STT["/api/transcribe\nGroq Whisper"]
    end

    subgraph Storage["Client Storage"]
        IDB["IndexedDB\nAES-256-GCM encrypted\nCipher + Plain separated"]
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
| **AI / LLM** | Claude (Haiku / Sonnet / Opus) via Vercel AI SDK |
| **Speech-to-Text** | Web Speech API + Groq Whisper |
| **Text-to-Speech** | Browser TTS + Google Cloud Neural2 + ElevenLabs |
| **Text Comparison** | jsdiff + Double Metaphone + Levenshtein distance |
| **Encryption** | AES-256-GCM + PBKDF2 (310k iterations) |
| **Local Storage** | IndexedDB with Web Crypto API |
| **Audio Effects** | Web Audio API (synthesized gavel knocks) |
| **Ritual Format** | `.mram` custom encrypted binary |

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
- Try switching voice engines (Browser TTS, Google, ElevenLabs)
- Some browsers block autoplay — click a button first to allow audio

## AI Coach not responding

- Verify `ANTHROPIC_API_KEY` in `.env` is correct
- Check key validity at [console.anthropic.com](https://console.anthropic.com/)
- Restart the dev server after any `.env` change

## Voice engines not showing up

- Confirm the API key for that engine is in `.env`
- Restart the dev server (`npm run dev`)
- Check the browser console (F12) for API errors

---

---

# FAQ

---

**Can I use this on my phone?**
Yes. Fully responsive with mobile-optimized navigation. Works in any modern mobile browser.

**Does the AI store my ritual text?**
No. Anthropic does not train on API data. Text is sent only during active chat sessions and is not retained.

**Can I practice offline?**
Solo Practice with Browser TTS works fully offline. AI Coach and cloud TTS/STT need internet.

**What degrees are supported?**
Any ceremony formatted as an `.mram` file. The app is ceremony-agnostic.

**How do I share with my lodge?**
Deploy to Vercel (free tier works), share the URL. Each member uploads the same `.mram` file with the lodge passphrase. No accounts needed.

**Is my data safe?**
Yes. AES-256-GCM encryption, PBKDF2 key derivation (310k iterations), no server-side storage, no tracking. Your ritual stays in your browser.
