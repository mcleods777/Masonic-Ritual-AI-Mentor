# Masonic Ritual Mentor

A privacy-first, voice-driven practice tool for Masonic ritual memorization. Upload your ritual document, practice by speaking your lines, and get instant word-by-word feedback with AI coaching.

## Features

- **Document Upload** — Upload PDF, DOCX, or TXT ritual documents. Parsed and encrypted entirely on your device using AES-256-GCM. The document never leaves your browser.
- **Voice Practice** — Speak your ritual lines aloud using your microphone. Real-time speech-to-text transcription captures your words as you recite.
- **Word-by-Word Comparison** — A 5-layer comparison pipeline checks your recitation against the source text:
  1. Text normalization (lowercase, expand contractions, strip filler words)
  2. Word-level diff (jsdiff)
  3. Phonetic forgiveness (Double Metaphone — catches STT artifacts like "rite" vs "right")
  4. Fuzzy tolerance (Levenshtein distance for near-matches)
  5. Accuracy scoring with color-coded visual diff
- **Voice Feedback** — Hear the correct words spoken aloud using text-to-speech when you make errors.
- **AI Ritual Coach** — Chat with an AI coach (powered by Claude) that knows your ritual text. Ask questions, get hints, or have it quiz you on the catechism.
- **Section Detection** — Automatically detects degrees, sections, and speaker roles (W.M., S.W., J.D., etc.) in your uploaded text.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), React, TypeScript |
| Styling | Tailwind CSS v4 |
| AI/LLM | Claude Haiku 3.5 via Vercel AI SDK |
| Speech-to-Text | Web Speech API (with provider interface for Whisper-Web upgrade) |
| Text-to-Speech | Web Speech Synthesis API |
| Text Comparison | jsdiff + custom phonetic/fuzzy matching |
| Document Parsing | pdf.js, mammoth.js (all client-side) |
| Storage | IndexedDB with Web Crypto API (AES-256-GCM) encryption |

## Getting Started

### Prerequisites

- Node.js 18+
- An Anthropic API key (for the AI Coach feature)

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Add your Anthropic API key to .env
# ANTHROPIC_API_KEY=sk-ant-your-key-here

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Usage

1. **Upload** your ritual document (PDF, DOCX, or TXT) on the Upload page
2. **Navigate** to Practice Mode and select a section to practice
3. **Tap "Start Reciting"** and speak your lines from memory
4. **Tap "Stop & Check"** to see word-by-word accuracy results
5. **Tap "Hear Corrections"** to have the correct version read aloud
6. **Visit the AI Coach** to ask questions or get hints about the ritual

## Privacy

- Ritual documents are parsed **entirely in the browser** — they never leave your device
- Document text is encrypted at rest in IndexedDB using **AES-256-GCM**
- Speech recognition uses the **browser's built-in Web Speech API** by default
- The AI Coach sends only the relevant section text to the API; Anthropic does not use API data for training
- No user accounts, analytics, or tracking

## Architecture

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/chat/route.ts   # AI coaching API (streams Claude responses)
│   ├── chat/page.tsx       # AI Coach chat interface
│   ├── practice/page.tsx   # Practice mode with section selection
│   ├── upload/page.tsx     # Document upload page
│   ├── layout.tsx          # Root layout with navigation
│   ├── page.tsx            # Home page / dashboard
│   └── globals.css         # Global styles
├── components/
│   ├── ChatInterface.tsx   # AI chat with voice input/output
│   ├── DiffDisplay.tsx     # Color-coded word-by-word diff
│   ├── DocumentUpload.tsx  # Drag-and-drop file upload
│   ├── Navigation.tsx      # App navigation (mobile bottom bar + desktop top nav)
│   └── PracticeMode.tsx    # Full practice UI (section select, STT, comparison)
└── lib/
    ├── document-parser.ts  # PDF/DOCX/TXT parsing + section detection
    ├── speech-to-text.ts   # STT engine with provider interface
    ├── storage.ts          # Encrypted IndexedDB storage
    ├── text-comparison.ts  # 5-layer comparison pipeline
    └── text-to-speech.ts   # TTS engine for speaking corrections
```

## Deploying

Deploy to Vercel:

```bash
npm run build
# Deploy via Vercel CLI or connect your GitHub repo at vercel.com
```

Set the `ANTHROPIC_API_KEY` environment variable in your Vercel project settings.

## Future Enhancements

- **Whisper-Web** (on-device, WebAssembly) for fully private speech recognition
- **AssemblyAI** integration with Keyterms Prompting for enhanced Masonic vocabulary recognition
- **Spaced repetition** tracking for trouble spots across sessions
- **Call-and-response catechism mode** where the app plays the W.M. and you respond
- **Cipher-to-full-text progressive disclosure** mirroring how Masons learn from cipher books
- **Invite-code system** for lodge-controlled access
- **Supabase backend** for multi-device sync and user progress tracking
