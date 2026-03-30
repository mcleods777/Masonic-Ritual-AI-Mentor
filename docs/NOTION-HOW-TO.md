# Masonic Ritual AI Mentor — How-To Guide

> A privacy-first, voice-driven practice tool for Masonic ritual memorization. Upload your encrypted ritual file, practice in multiple modes, and get AI coaching — all with military-grade encryption keeping your ritual secure.

---

## Quick Start (5 Minutes)

### Step 1: Get the App Running

**Prerequisites:**
- Node.js 18 or higher installed on your machine
- An Anthropic API key from [console.anthropic.com](https://console.anthropic.com/)

**Install & Launch:**

```bash
git clone https://github.com/mcleods777/masonic-ritual-ai-mentor.git
cd masonic-ritual-ai-mentor
npm install
cp .env.example .env
```

Open the `.env` file and add your API key:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Then start the app:

```bash
npm run dev
```

Open **http://localhost:3000** in your browser. That's it — the app is running.

---

### Step 2: Upload Your Ritual File

1. Navigate to the **Upload** page
2. Drag and drop your `.mram` encrypted ritual file (provided by your lodge secretary)
3. Enter your **lodge passphrase** when prompted
4. The app decrypts the file, splits it into cipher text and plain text, re-encrypts it with a new browser key, and stores it securely in your browser's IndexedDB
5. The original `.mram` file is never stored — only the re-encrypted version

> **What is cipher text?** Cipher text is the abbreviated/encoded notation Masons use as memory aids (e.g., "B. S.W., p. t. s. y. t. a. p. a. M."). Plain text is the full English version. You always see cipher text on screen; plain text is only used internally for AI coaching and accuracy checking.

---

## Practice Modes

### Solo Practice

**What it does:** Drill a single section of the ritual until you have it memorized.

**How to use it:**

1. Go to **Practice** and select **Solo Practice**
2. Choose a section from the dropdown (e.g., "Opening the Lodge")
3. Cipher text is displayed on screen as your reference
4. Click the microphone button to **speak your lines** from memory, or type them in the text box
5. Hit **Check** to see your accuracy

**Understanding your score:**

The app runs a 5-layer comparison against the plain text:

| Color | Meaning |
|-------|---------|
| **Green** | Correct — you got it right |
| **Red** | Wrong — different word |
| **Blue** | Phonetic match — you said the right word but speech recognition spelled it differently (e.g., "rite" vs. "right") |
| **Yellow** | Fuzzy match — close enough (minor misspelling or variation) |
| **Gray / strikethrough** | Missing — you skipped this word |

After checking, the app can **read back the correct version** using text-to-speech so you hear what you missed.

---

### Listen Mode

**What it does:** Plays the entire ceremony aloud with a unique AI voice for each officer role, so you can listen and follow along.

**How to use it:**

1. Go to **Practice** and select **Listen Mode**
2. Press **Play**
3. The app reads through the ceremony line by line:
   - Each officer has a distinct voice (Worshipful Master sounds deep and authoritative, Senior Warden is clear and measured, etc.)
   - Gavel marks (`*`) produce synthesized knock sounds
   - Stage directions are shown but not spoken
4. The script auto-scrolls and highlights the current line (showing cipher text)
5. Use **Pause/Resume** to control playback

**Voice options:**
- **Browser TTS** (free, works offline) — default
- **Google Cloud TTS** (premium Neural2 voices) — requires API key
- **ElevenLabs** (ultra-realistic human-like voices) — requires API key

Select your preferred voice engine using the dropdown in the voice settings panel.

---

### Rehearsal Mode

**What it does:** Simulates a full ceremony where the AI reads all other officers' parts, and you speak your own lines.

**How to use it:**

1. Go to **Practice** and select **Rehearsal Mode**
2. **Pick your officer role** (WM, SW, JW, SD, JD, Chaplain, Tyler, etc.)
3. Press **Start Rehearsal**
4. The ceremony begins:
   - When it's another officer's line → the AI reads it aloud with that role's voice
   - When it's **your line** → you see a "Your Turn" prompt
   - Speak or type your line from memory
   - Your answer is scored instantly against the plain text
5. When the ceremony finishes, you get a **results summary**:
   - Overall accuracy percentage
   - Line-by-line breakdown showing where you were strong and where you need work

---

### AI Ritual Coach

**What it does:** Chat with Claude AI about your specific ritual. Ask questions, get hints, request quizzes, or clarify ceremony procedures.

**How to use it:**

1. Go to the **AI Coach** page
2. Type a question (e.g., "What does the Senior Warden say after the Worshipful Master's opening?")
3. Claude responds using your ritual's plain text as context
4. Optionally enable **voice readback** to hear the answer spoken aloud

**Model selection:**
- **Haiku** — fastest responses, good for quick questions
- **Sonnet** — balanced speed and quality
- **Opus** — most capable, best for complex questions

**Privacy note:** Only plain text is sent to Claude's API. Cipher text never leaves your browser. Anthropic does not train on API data.

**Safety:** The AI is instructed to never reveal grips, passwords, or modes of recognition — it will decline those requests.

---

## Setting Up Voice Engines

### Browser TTS (Default — No Setup Required)

Works out of the box. Uses your browser's built-in speech synthesis. Quality varies by browser and OS. Each officer role gets different pitch and rate settings to sound distinct.

### Google Cloud TTS (Premium)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Cloud Text-to-Speech API**
3. Create an API key at **APIs & Services → Credentials**
4. Add to your `.env` file:

```
GOOGLE_CLOUD_TTS_API_KEY=your-key-here
```

5. Restart the app — Google voices will appear in the voice engine selector

### ElevenLabs (Ultra-Realistic)

1. Sign up at [elevenlabs.io](https://elevenlabs.io/)
2. Go to your **Profile** and copy your API key
3. Add to your `.env` file:

```
ELEVENLABS_API_KEY=your-key-here
```

4. Restart the app — ElevenLabs voices will appear in the voice engine selector

### Groq Whisper STT (High-Accuracy Speech Recognition)

For better speech-to-text accuracy (especially with Masonic vocabulary):

1. Sign up at [console.groq.com](https://console.groq.com/)
2. Create an API key
3. Add to your `.env` file:

```
GROQ_API_KEY=your-key-here
```

4. Restart the app — Groq Whisper will be available as an STT option

> Without Groq, the app uses your browser's built-in speech recognition, which works well for general speech but may struggle with Masonic-specific terms.

---

## Building .mram Ritual Files

If your lodge secretary hasn't provided an `.mram` file, you can build one from a markdown source file.

### Input Format

Create a markdown file where each spoken line appears **twice** — cipher text first, then plain text:

```markdown
### Opening the Lodge

WM: * Bro. S.W., p. t. s. y. t. a. p. a. M.
WM: * Brother Senior Warden, proceed to satisfy yourself that all present are Masons.

SW: * Bros. S. & J.D., p. t. s. y. t. a. p. a. M.
SW: * Brothers Senior & Junior Deacons, proceed to satisfy yourselves that all present are Masons.
```

**Format rules:**
- `### Heading` marks a new section
- Lines start with a role abbreviation followed by a colon (e.g., `WM:`, `SW:`, `JD:`)
- `*` at the start of a line indicates a gavel mark (knock)
- Text in `(parentheses)` is treated as a stage direction
- Each line pair: first is cipher, second is plain

### Build Command

```bash
npx tsx scripts/build-mram.ts input.md output.mram "YourLodgePassphrase"
```

This produces an encrypted `.mram` file that can be shared with lodge members who know the passphrase.

---

## Deploying to Production

### Deploy on Vercel (Recommended)

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com/) and import the repository
3. Add environment variables in the Vercel project settings:
   - `ANTHROPIC_API_KEY` (required)
   - `GOOGLE_CLOUD_TTS_API_KEY` (optional)
   - `ELEVENLABS_API_KEY` (optional)
   - `GROQ_API_KEY` (optional)
4. Deploy — Vercel handles the build automatically

### Build for Other Hosting

```bash
npm run build
npm start
```

The app runs as a standard Next.js 16 application on port 3000.

---

## Privacy & Security

| What | Where It Lives |
|------|---------------|
| Ritual text (cipher + plain) | Encrypted in your browser's IndexedDB (AES-256-GCM) |
| Encryption key | Generated and stored in your browser only |
| Your practice scores | Stored locally in your browser |
| Speech recognition (browser) | Processed on your device |
| Browser voice playback | Processed on your device |
| AI Coach conversations | Plain text sent to Claude API (Anthropic does not train on API data) |
| Google/ElevenLabs TTS | Plain text sent for speech synthesis when those engines are selected |
| API keys | Stored server-side only, never exposed to the browser |
| Your .mram file | **Never stored** — only re-encrypted data is kept |

**No user accounts. No tracking. No analytics. No cookies beyond what Next.js requires.**

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| AI/LLM | Claude (Haiku / Sonnet / Opus) via Vercel AI SDK |
| Speech-to-Text | Web Speech API + Groq Whisper (optional) |
| Text-to-Speech | Browser Web Speech + Google Cloud TTS + ElevenLabs |
| Text Comparison | jsdiff + Double Metaphone + Levenshtein distance |
| Encryption | AES-256-GCM + PBKDF2 (310,000 iterations) |
| Storage | IndexedDB with Web Crypto API |
| Audio Effects | Web Audio API (synthesized gavel knocks) |
| Ritual Format | .mram encrypted binary |

---

## Troubleshooting

### "Decryption failed" when uploading .mram file
- Double-check your lodge passphrase (it's case-sensitive)
- Make sure the `.mram` file hasn't been corrupted during transfer
- Verify you're using the correct file for your jurisdiction/degree

### Speech recognition not working
- Make sure your browser supports the Web Speech API (Chrome and Edge work best)
- Grant microphone permission when prompted
- If accuracy is poor, consider setting up Groq Whisper for better Masonic vocabulary recognition

### No sound in Listen/Rehearsal mode
- Check that your device volume is on and not muted
- Try switching voice engines (Browser TTS → Google → ElevenLabs)
- Some browsers block auto-playing audio — click a play button to start

### AI Coach not responding
- Verify your `ANTHROPIC_API_KEY` is set correctly in `.env`
- Check that the API key is valid at [console.anthropic.com](https://console.anthropic.com/)
- Restart the dev server after changing `.env`

### Voice engines not appearing
- Make sure the API key for that engine is set in `.env`
- Restart the dev server (`npm run dev`) after adding keys
- Check the browser console for API errors

---

## FAQ

**Q: Can I use this on my phone?**
A: Yes. The app is fully responsive with a mobile-optimized bottom navigation bar. Use it in any modern mobile browser.

**Q: Does the AI store my ritual text?**
A: No. Anthropic's API does not train on data sent through the API. Your ritual text is sent only during active AI Coach conversations and is not retained.

**Q: Can I practice without an internet connection?**
A: Partially. Solo Practice with Browser TTS works fully offline. AI Coach, Google TTS, and ElevenLabs require an internet connection.

**Q: What degrees/ceremonies are supported?**
A: Any ceremony that's been formatted as an `.mram` file. The app is ceremony-agnostic — it works with whatever ritual text you provide.

**Q: How do I share the app with my lodge?**
A: Deploy to Vercel (free tier works), then share the URL. Each member uploads the same `.mram` file with the lodge passphrase. No accounts needed.
