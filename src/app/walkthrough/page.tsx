export default function WalkthroughPage() {
  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="text-center py-8">
        <h1 className="text-3xl md:text-4xl font-bold text-zinc-100 tracking-tight">
          How It All Works
        </h1>
        <p className="text-zinc-400 mt-3 max-w-2xl mx-auto">
          A walkthrough of the app architecture &mdash; how your ritual gets
          parsed, practiced, and coached with AI and voice.
        </p>
      </div>

      {/* Table of Contents */}
      <nav className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
          On this page
        </h2>
        <ol className="grid sm:grid-cols-2 gap-2 text-sm">
          {[
            ["#overview", "High-Level Overview"],
            ["#upload", "Document Upload & Storage"],
            ["#listen", "Listen Mode"],
            ["#rehearsal", "Rehearsal Mode"],
            ["#solo", "Solo Practice Mode"],
            ["#tts", "Voice AI (Text-to-Speech)"],
            ["#chat", "AI Coach (Claude)"],
            ["#privacy", "Privacy & Security"],
          ].map(([href, label], i) => (
            <li key={href}>
              <a
                href={href}
                className="flex items-center gap-2 text-zinc-300 hover:text-amber-400 transition-colors py-1"
              >
                <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {i + 1}
                </span>
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* 1. High-Level Overview */}
      <Section id="overview" number={1} title="High-Level Overview">
        <p className="text-zinc-400 text-sm mb-4">
          The app is built with Next.js and runs mostly in your browser. Ritual
          text never leaves your device &mdash; it&apos;s encrypted and stored locally.
          The only external calls are to AI (Claude) and premium voice engines
          (Google Cloud / ElevenLabs).
        </p>
        <Diagram>{`
┌──────────────────────────────────────────────────────────┐
│                    YOUR BROWSER                          │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌────────┐ │
│  │   Home   │  │  Upload  │  │ Practice  │  │  Chat  │ │
│  │    /     │  │ /upload  │  │ /practice │  │ /chat  │ │
│  └──────────┘  └────┬─────┘  └─────┬─────┘  └───┬────┘ │
│                     │              │             │       │
│                     ▼              ▼             │       │
│              ┌─────────────────────────────┐     │       │
│              │     Encrypted IndexedDB     │     │       │
│              │     (AES-256-GCM)           │     │       │
│              │     Ritual text stays here  │     │       │
│              └─────────────────────────────┘     │       │
│                            │                     │       │
│                 ┌──────────┴──────────┐          │       │
│                 ▼                     ▼          ▼       │
│          ┌───────────┐        ┌────────────┐            │
│          │ Voice AI  │        │ Text AI    │            │
│          │ (TTS/STT) │        │ (Claude)   │            │
│          └─────┬─────┘        └─────┬──────┘            │
└────────────────┼────────────────────┼────────────────────┘
                 │                    │
      ┌──────────┼──────────┐         │
      ▼          ▼          ▼         ▼
  ┌────────┐ ┌────────┐ ┌──────┐ ┌──────────┐
  │Browser │ │Google  │ │Eleven│ │Anthropic │
  │Web     │ │Cloud   │ │Labs  │ │Claude API│
  │Speech  │ │TTS API │ │API   │ │          │
  │(free)  │ │        │ │      │ │          │
  └────────┘ └────────┘ └──────┘ └──────────┘
   on-device   server     server    server
               proxy      proxy     proxy
        `}</Diagram>
      </Section>

      {/* 2. Document Upload & Storage */}
      <Section id="upload" number={2} title="Document Upload & Storage">
        <p className="text-zinc-400 text-sm mb-4">
          When you upload a PDF, DOCX, or TXT file, the app parses it entirely
          in your browser. It detects degrees, sections, and speakers, then
          encrypts everything before storing it in IndexedDB.
        </p>
        <Diagram>{`
  You drop a file (PDF / DOCX / TXT)
              │
              ▼
  ┌───────────────────────────┐
  │     Document Parser       │
  │                           │
  │  PDF  → pdfjs-dist        │
  │  DOCX → mammoth           │
  │  TXT  → plain text        │
  └─────────────┬─────────────┘
                │
                ▼
  ┌───────────────────────────┐
  │     Structure Text        │
  │                           │
  │  • Detect degree          │
  │    (EA, FC, MM)           │
  │  • Detect section         │
  │    (Opening, Lecture...)  │
  │  • Extract speakers       │
  │    (WM:, SW:, JD:...)    │
  └─────────────┬─────────────┘
                │
                ▼
  ┌───────────────────────────┐
  │  RitualSection[]          │
  │  { speaker, text,         │
  │    degree, sectionName }  │
  └─────────────┬─────────────┘
                │
                ▼
  ┌───────────────────────────┐
  │  Encrypt (AES-256-GCM)    │
  │  Store in IndexedDB       │
  │  ─────────────────────    │
  │  documents: encrypted raw │
  │  sections:  encrypted per │
  │             section       │
  │  settings:  encryption    │
  │             key (JWK)     │
  └───────────────────────────┘
        `}</Diagram>
      </Section>

      {/* 3. Listen Mode */}
      <Section id="listen" number={3} title="Listen Mode">
        <p className="text-zinc-400 text-sm mb-4">
          Passive playback of the full ceremony. Each officer role gets a
          distinct voice. You follow along in the scrolling script while the AI
          reads every part aloud.
        </p>
        <Diagram>{`
  [Play Ceremony]
        │
        ▼
  for each section in order:
        │
        ├── Has gavel marks (* or ***)?
        │   └──▶ Web Audio API synthesizes knock
        │        (low thump + wood texture + click)
        │        spaced 350ms apart
        │
        ├── Has a speaker (WM, SW, JD...)?
        │   └──▶ speakAsRole(text, role)
        │        │
        │        ▼
        │   ┌─────────────────────────────┐
        │   │  TTS Engine (your choice)   │
        │   │                             │
        │   │  Browser: pitch/rate vary   │
        │   │    WM → deep & slow         │
        │   │    JD → higher & brighter   │
        │   │                             │
        │   │  Google Cloud: different    │
        │   │    Neural2 voices per role  │
        │   │                             │
        │   │  ElevenLabs: different      │
        │   │    premium voices per role  │
        │   └─────────────────────────────┘
        │        │
        │        ▼  waits for audio to finish
        │
        ├── No speaker (stage direction)?
        │   └──▶ 600ms pause, then continue
        │
        ▼
  Advance to next line, scroll script
  Highlight current line in blue

  Controls: [Play] [Pause] [Stop]
        `}</Diagram>
      </Section>

      {/* 4. Rehearsal Mode */}
      <Section id="rehearsal" number={4} title="Rehearsal Mode">
        <p className="text-zinc-400 text-sm mb-4">
          Interactive role-playing. You pick your officer role, and the AI reads
          all the other parts. When it&apos;s your turn, you recite from memory and
          get accuracy scoring on each line.
        </p>
        <Diagram>{`
  1. SETUP
     Pick your role (WM, SW, JD, SD...)
     Each role gets a distinct AI voice
              │
              ▼
  2. CEREMONY LOOP
     for each line in the ritual:
              │
     ┌────────┴────────────────────────────┐
     │                                     │
     ▼                                     ▼
  Other officer's line?              Your line?
     │                                     │
     ▼                                     ▼
  AI speaks it with                  "YOUR TURN" prompt
  that role's voice                        │
     │                              ┌──────┴──────┐
     │                              ▼             ▼
     │                          [Speak]       [Type]
     │                              │             │
     │                              ▼             │
     │                     Web Speech API         │
     │                     (transcribes you)      │
     │                              │             │
     │                              └──────┬──────┘
     │                                     │
     │                                     ▼
     │                          ┌───────────────────┐
     │                          │ 5-Layer Accuracy  │
     │                          │                   │
     │                          │ 1. Normalize text │
     │                          │ 2. Word-level diff│
     │                          │ 3. Phonetic match │
     │                          │    (tiler→tyler)  │
     │                          │ 4. Fuzzy match    │
     │                          │    (Levenshtein)  │
     │                          │ 5. Score (0-100%) │
     │                          └────────┬──────────┘
     │                                   │
     │                                   ▼
     │                          Color-coded diff
     │                          [Continue] button
     │                                   │
     └────────────────┬──────────────────┘
                      ▼
              Next line...
                      │
                      ▼
  3. RESULTS
     Overall accuracy %
     Per-line breakdown
     [Rehearse Again] [Change Role]
        `}</Diagram>
      </Section>

      {/* 5. Solo Practice */}
      <Section id="solo" number={5} title="Solo Practice Mode">
        <p className="text-zinc-400 text-sm mb-4">
          Drill a single section at a time. Pick a section from your ritual,
          recite it from memory, and get detailed word-by-word feedback with
          audio corrections.
        </p>
        <Diagram>{`
  1. Pick a section
     (grouped by degree: EA / FC / MM)
              │
              ▼
  2. Recite from memory
     ┌────────┴────────┐
     ▼                 ▼
  [Speak]           [Type]
     │                 │
     ▼                 │
  Web Speech API       │
  (real-time           │
   transcription)      │
     │                 │
     └────────┬────────┘
              │
              ▼
  3. Accuracy check
     ┌───────────────────────┐
     │  compareTexts()       │
     │                       │
     │  "you said X"         │
     │  "correct was Y"      │
     │                       │
     │  Word-by-word diff:   │
     │  ✓ correct (green)    │
     │  ✗ wrong (red)        │
     │  ~ phonetic (blue)    │
     │  ? fuzzy (yellow)     │
     │  - missing (gray)     │
     └───────────┬───────────┘
                 │
                 ▼
  4. Feedback
     [Hear Corrections] → TTS reads back errors
     [Hear Feedback]    → Encouraging message
                           based on score
        `}</Diagram>
      </Section>

      {/* 6. Voice AI (TTS) Pipeline */}
      <Section id="tts" number={6} title="Voice AI (Text-to-Speech)">
        <p className="text-zinc-400 text-sm mb-4">
          Three TTS engines are available. The engine you pick applies to all
          modes. Cloud engines go through server-side API routes so your keys
          stay secret.
        </p>
        <Diagram>{`
  speakAsRole("Worshipful Master, the Lodge...", "SW")
              │
              ▼
  ┌──────────────────────────────┐
  │  text-to-speech.ts           │
  │  Routes to selected engine   │
  │  (saved in localStorage)     │
  └──────────────┬───────────────┘
                 │
    ┌────────────┼─────────────────┐
    ▼            ▼                 ▼
  Browser     Google Cloud     ElevenLabs
    │            │                 │
    ▼            ▼                 ▼
  Web Speech   POST              POST
  Synthesis    /api/tts/google   /api/tts/elevenlabs
  API            │                 │
  (runs          │ retry 2x       │
  locally,       │ on 429/5xx     │
  free)          │                 │
                 ▼                 ▼
            Google Cloud      ElevenLabs
            TTS API           API
                 │                 │
                 ▼                 ▼
              MP3 blob          MP3 blob
                 │                 │
                 └────────┬────────┘
                          ▼
                   playAudioBlob()
                   (HTMLAudioElement)
                          │
                          ▼
                      Speaker
        `}</Diagram>

        <h3 className="text-sm font-semibold text-zinc-300 mt-6 mb-3">
          Voice mapping per role
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-400 border-b border-zinc-800">
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Google Cloud Voice</th>
                <th className="py-2 pr-4">Browser</th>
                <th className="py-2">Character</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {[
                ["WM", "Neural2-D", "pitch 0.75", "Deep, authoritative, slow"],
                ["SW", "Neural2-A", "pitch 0.88", "Clear, measured"],
                ["JW", "Neural2-J", "pitch 1.00", "Mid-range, steady"],
                ["SD", "Neural2-I", "pitch 1.05", "Slightly brighter"],
                ["JD", "Neural2-B (UK)", "pitch 1.15", "British accent, crisp"],
                ["Chaplain", "Neural2-D", "pitch 0.80", "Deepest, slowest"],
                ["Tyler", "Neural2-B (UK)", "pitch 1.20", "Higher, distinct"],
              ].map(([role, google, browser, character]) => (
                <tr key={role} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-4 font-mono text-amber-400">{role}</td>
                  <td className="py-2 pr-4 font-mono text-zinc-400">{google}</td>
                  <td className="py-2 pr-4 font-mono text-zinc-400">{browser}</td>
                  <td className="py-2 text-zinc-500">{character}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 7. AI Coach */}
      <Section id="chat" number={7} title="AI Coach (Claude)">
        <p className="text-zinc-400 text-sm mb-4">
          The chat page lets you talk to a Claude-powered AI coach that knows
          your ritual. Your ritual text is injected into the system prompt so
          Claude can quote accurately. Choose from four model tiers.
        </p>
        <Diagram>{`
  You: "What comes after 'I was conducted
        to the center of the Lodge'?"
              │
              ▼
  ┌───────────────────────────────────┐
  │  ChatInterface.tsx                │
  │                                   │
  │  Optional: voice input via        │
  │  Web Speech API (speak your       │
  │  question instead of typing)      │
  └──────────────┬────────────────────┘
                 │
                 ▼
  POST /api/chat
  ┌───────────────────────────────────┐
  │  Server builds request:           │
  │                                   │
  │  System Prompt:                   │
  │  "You are a patient Past Master   │
  │   and Masonic ritual coach...     │
  │   ONLY quote from this text:      │
  │   ┌─────────────────────────┐     │
  │   │ {your full ritual text  │     │
  │   │  injected here}         │     │
  │   └─────────────────────────┘     │
  │   NEVER reveal grips/passwords"   │
  │                                   │
  │  Model (your choice):             │
  │  • Claude 3.5 Haiku (fastest)     │
  │  • Claude Haiku 4.5               │
  │  • Claude Sonnet 4.5 (balanced)   │
  │  • Claude Opus 4.6 (smartest)     │
  └──────────────┬────────────────────┘
                 │
                 ▼
  ┌───────────────────────────────────┐
  │  Anthropic Claude API             │
  │  (streaming response)             │
  └──────────────┬────────────────────┘
                 │
                 ▼
  Response streams into chat bubble
                 │
                 ▼ (if auto-speak is on)
  TTS reads the response aloud
  using your selected voice engine
        `}</Diagram>
      </Section>

      {/* 8. Privacy & Security */}
      <Section id="privacy" number={8} title="Privacy & Security">
        <p className="text-zinc-400 text-sm mb-4">
          The app is designed so your ritual text stays private. Here&apos;s what
          stays local vs. what goes to external services.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Stays on your device
            </h3>
            <ul className="text-sm text-zinc-400 space-y-1.5">
              <li>&bull; Ritual text (encrypted in IndexedDB)</li>
              <li>&bull; Encryption key (never transmitted)</li>
              <li>&bull; Practice scores and history</li>
              <li>&bull; TTS engine preference</li>
              <li>&bull; Browser speech recognition (when available)</li>
              <li>&bull; Browser TTS voice playback</li>
            </ul>
          </div>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Sent to external services
            </h3>
            <ul className="text-sm text-zinc-400 space-y-1.5">
              <li>&bull; AI Coach &rarr; Ritual text sent to Claude API</li>
              <li>&bull; Google TTS &rarr; Line text sent for synthesis</li>
              <li>&bull; ElevenLabs &rarr; Line text sent for synthesis</li>
              <li>&bull; API keys stay server-side (never in browser)</li>
              <li>&bull; Anthropic does not train on API data</li>
            </ul>
          </div>
        </div>
        <Diagram>{`
  ┌─────────────────────────────────────────────┐
  │              YOUR BROWSER                   │
  │                                             │
  │  ┌────────────────────────────────────────┐ │
  │  │  IndexedDB (encrypted)                 │ │
  │  │  ├── documents (AES-256-GCM cipher)    │ │
  │  │  ├── sections  (AES-256-GCM cipher)    │ │
  │  │  └── settings  (encryption key, JWK)   │ │
  │  └────────────────────────────────────────┘ │
  │         │                                   │
  │         │ decrypt on demand                 │
  │         ▼                                   │
  │  ┌──────────────┐    ┌──────────────────┐   │
  │  │ Practice     │    │ Chat             │   │
  │  │ (all 3 modes)│    │ (AI Coach)       │   │
  │  └──────┬───────┘    └────────┬─────────┘   │
  └─────────┼─────────────────────┼─────────────┘
            │                     │
    ┌───────┴───────┐             │
    ▼               ▼             ▼
  Browser      Next.js API    Next.js API
  Speech API   /api/tts/*     /api/chat
  (on-device)      │             │
                   ▼             ▼
              Google Cloud   Anthropic
              / ElevenLabs   Claude
              (line text     (ritual text
               only)          in system
                              prompt)
        `}</Diagram>
      </Section>
    </div>
  );
}

/* ── Reusable sub-components ────────────────────────────── */

function Section({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 scroll-mt-20"
    >
      <div className="flex items-center gap-3 mb-4">
        <span className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-bold flex-shrink-0">
          {number}
        </span>
        <h2 className="text-xl font-semibold text-zinc-100">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Diagram({ children }: { children: string }) {
  return (
    <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 overflow-x-auto text-xs md:text-sm leading-relaxed text-zinc-300 font-mono">
      {children.trim()}
    </pre>
  );
}
