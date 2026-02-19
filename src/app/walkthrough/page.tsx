export default function WalkthroughPage() {
  return (
    <div className="space-y-10 pb-12">
      {/* Header */}
      <div className="text-center py-10">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-zinc-100 tracking-tight">
          How It All Works
        </h1>
        <p className="text-zinc-400 mt-3 max-w-2xl mx-auto text-lg">
          A visual guide to how your ritual gets parsed, practiced, and
          coached with AI and voice.
        </p>
      </div>

      {/* Table of Contents */}
      <nav className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-4">
          Jump to section
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { href: "#overview", icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z", label: "Overview" },
            { href: "#upload", icon: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5", label: "Upload" },
            { href: "#listen", icon: "M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z", label: "Listen Mode" },
            { href: "#rehearsal", icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z", label: "Rehearsal" },
            { href: "#solo", icon: "M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z", label: "Solo Practice" },
            { href: "#tts", icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z", label: "Voice AI" },
            { href: "#chat", icon: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z", label: "AI Coach" },
            { href: "#privacy", icon: "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z", label: "Privacy" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/30 transition-all group"
            >
              <svg className="w-5 h-5 text-zinc-500 group-hover:text-amber-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              <span className="text-sm text-zinc-300 group-hover:text-zinc-100 font-medium transition-colors">{item.label}</span>
            </a>
          ))}
        </div>
      </nav>

      {/* ================================================================ */}
      {/* 1. HIGH-LEVEL OVERVIEW                                           */}
      {/* ================================================================ */}
      <Section id="overview" title="High-Level Overview" subtitle="The big picture of how everything connects">
        {/* Browser box */}
        <div className="bg-zinc-800/30 rounded-2xl border border-zinc-700/50 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
            <span className="ml-2 text-xs text-zinc-500 font-medium tracking-wide uppercase">Your Browser</span>
          </div>

          {/* 4 App Pages */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <MiniCard icon="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" label="Home" color="zinc" />
            <MiniCard icon="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" label="Upload" color="blue" />
            <MiniCard icon="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" label="Practice" color="amber" />
            <MiniCard icon="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" label="AI Coach" color="purple" />
          </div>

          <DownArrow />

          {/* Encrypted storage */}
          <div className="flex justify-center my-6">
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl px-6 py-4 flex items-center gap-4 max-w-md w-full">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <div>
                <p className="text-green-300 font-semibold text-sm">Encrypted Local Storage</p>
                <p className="text-green-400/60 text-xs">Your ritual text is AES-256 encrypted and never leaves your device</p>
              </div>
            </div>
          </div>

          <DownArrow />

          {/* Voice + Text AI */}
          <div className="grid md:grid-cols-2 gap-4 mt-6">
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                  </svg>
                </div>
                <p className="text-blue-300 font-semibold text-sm">Voice AI</p>
              </div>
              <p className="text-zinc-400 text-xs">Reads lines aloud with distinct voices per officer role. Listens when you speak your lines.</p>
            </div>
            <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <p className="text-purple-300 font-semibold text-sm">Claude AI Coach</p>
              </div>
              <p className="text-zinc-400 text-xs">Chat with an AI that knows your ritual. Ask questions, get hints, and receive coaching.</p>
            </div>
          </div>
        </div>

        <DownArrow label="connects to" />

        {/* External services */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ServiceCard label="Browser Speech" desc="Free, on-device" color="green" />
          <ServiceCard label="Google Cloud TTS" desc="Premium voices" color="blue" />
          <ServiceCard label="ElevenLabs" desc="Premium voices" color="blue" />
          <ServiceCard label="Claude API" desc="AI coaching" color="purple" />
        </div>
      </Section>

      {/* ================================================================ */}
      {/* 2. DOCUMENT UPLOAD                                               */}
      {/* ================================================================ */}
      <Section id="upload" title="Encrypted .mram Upload" subtitle="How your encrypted ritual file gets decrypted, split, and re-secured">
        <div className="max-w-lg mx-auto">
          <FlowStep
            icon="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            color="blue"
            title="You upload a .mram file"
            desc="Drop or select your encrypted .mram ritual file. The app validates the magic bytes (MRAM header) before proceeding."
          />
          <DownArrow />
          <FlowStep
            icon="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
            color="amber"
            title="Enter your lodge passphrase"
            desc="Your passphrase is used with PBKDF2 (310,000 iterations) to derive the decryption key. The file is decrypted with AES-256-GCM."
          />
          <DownArrow />
          <FlowStep
            icon="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            color="amber"
            title="Validated & structured"
            desc="The decrypted JSON is checked against a SHA-256 checksum to detect tampering. Each line has separate cipher text (abbreviated) and plain text (full English), plus role, gavels, and actions."
          >
            <div className="flex flex-wrap gap-2 mt-3">
              <Tag>Cipher text (shown to you)</Tag>
              <Tag>Plain text (for AI only)</Tag>
            </div>
          </FlowStep>
          <DownArrow />
          <FlowStep
            icon="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            color="green"
            title="Re-encrypted & stored locally"
            desc="Cipher text and plain text are encrypted into separate fields with AES-256-GCM and stored in IndexedDB. They never cross contexts — cipher is for display, plain is for AI and comparison."
          />
        </div>
      </Section>

      {/* ================================================================ */}
      {/* 3. LISTEN MODE                                                   */}
      {/* ================================================================ */}
      <Section id="listen" title="Listen Mode" subtitle="Sit back and hear the full ceremony read aloud">
        <div className="max-w-lg mx-auto">
          <FlowStep
            icon="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
            color="blue"
            title="Press Play"
            desc="The app begins reading through the ceremony from start to finish."
          />
          <DownArrow />

          {/* Branching: what happens for each line */}
          <div className="bg-zinc-800/40 rounded-xl border border-zinc-700/50 p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-4">For each line in the ceremony</p>

            <div className="space-y-4">
              <BranchItem
                color="yellow"
                title="Gavel marks?"
                desc="Synthesized knock sounds play (a deep thump with a wood texture), spaced evenly apart."
              />
              <BranchItem
                color="blue"
                title="Officer speaking?"
                desc="The line is read aloud using that officer's unique voice. The Worshipful Master sounds deep and authoritative, while the Junior Deacon sounds brighter and crisper."
              />
              <BranchItem
                color="zinc"
                title="Stage direction?"
                desc="A brief pause, then the app moves to the next line."
              />
            </div>
          </div>

          <DownArrow />
          <FlowStep
            icon="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
            color="blue"
            title="Script scrolls along"
            desc="The current line is highlighted and the script auto-scrolls so you can follow along. Use Play, Pause, or Stop at any time."
          />
        </div>
      </Section>

      {/* ================================================================ */}
      {/* 4. REHEARSAL MODE                                                */}
      {/* ================================================================ */}
      <Section id="rehearsal" title="Rehearsal Mode" subtitle="Practice your role while the AI reads the other parts">
        <div className="max-w-xl mx-auto">
          <FlowStep
            icon="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            color="amber"
            title="1. Pick your role"
            desc="Choose which officer you want to practice (WM, SW, JD, SD, etc.). Each other role gets its own distinct AI voice."
          />
          <DownArrow />

          {/* The ceremony loop */}
          <div className="bg-zinc-800/40 rounded-xl border border-zinc-700/50 p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-5">2. The ceremony plays through line by line</p>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Other officer path */}
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                    </svg>
                  </div>
                  <p className="text-blue-300 font-semibold text-sm">Other officer&apos;s line</p>
                </div>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  The AI reads it aloud with that role&apos;s unique voice, then automatically moves to the next line.
                </p>
              </div>

              {/* User's turn path */}
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <p className="text-amber-300 font-semibold text-sm">Your line!</p>
                </div>
                <p className="text-zinc-400 text-xs leading-relaxed mb-3">
                  The app pauses and says &ldquo;Your Turn.&rdquo; Recite from memory by speaking or typing.
                </p>
                <div className="flex gap-2">
                  <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 rounded-md text-xs font-medium">Speak</span>
                  <span className="px-2.5 py-1 bg-zinc-700 text-zinc-300 rounded-md text-xs font-medium">Type</span>
                  <span className="px-2.5 py-1 bg-zinc-700 text-zinc-400 rounded-md text-xs font-medium">Skip</span>
                </div>
              </div>
            </div>
          </div>

          <DownArrow />

          {/* Accuracy checking */}
          <FlowStep
            icon="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            color="green"
            title="Your line is scored"
            desc="A 5-layer comparison checks your recitation against the original text."
          >
            <div className="grid grid-cols-2 gap-2 mt-3">
              <ScoreLabel color="green" label="Correct words" />
              <ScoreLabel color="red" label="Wrong words" />
              <ScoreLabel color="blue" label="Phonetic matches" example="tiler = tyler" />
              <ScoreLabel color="yellow" label="Fuzzy matches" example="close enough" />
            </div>
          </FlowStep>

          <DownArrow />
          <FlowStep
            icon="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            color="amber"
            title="3. See your results"
            desc="When the ceremony is done, you get an overall accuracy percentage and a line-by-line breakdown of how you did."
          />
        </div>
      </Section>

      {/* ================================================================ */}
      {/* 5. SOLO PRACTICE                                                 */}
      {/* ================================================================ */}
      <Section id="solo" title="Solo Practice Mode" subtitle="Drill a single section until you have it perfect">
        <div className="max-w-lg mx-auto">
          <FlowStep
            icon="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
            color="amber"
            title="1. Pick a section"
            desc="Sections are grouped by degree (Entered Apprentice, Fellow Craft, Master Mason). Pick the one you want to drill."
          />
          <DownArrow />
          <FlowStep
            icon="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            color="blue"
            title="2. Recite from memory"
            desc="Speak your lines aloud (the app transcribes in real time) or type them from memory."
          />
          <DownArrow />

          {/* Accuracy visualization */}
          <div className="bg-zinc-800/40 rounded-xl border border-zinc-700/50 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-zinc-200 font-semibold text-sm">3. Word-by-word accuracy check</p>
                <p className="text-zinc-500 text-xs">Every word is compared against the original</p>
              </div>
            </div>
            {/* Example diff */}
            <div className="bg-zinc-900 rounded-lg p-4 font-mono text-sm leading-loose">
              <span className="text-green-400">I </span>
              <span className="text-green-400">was </span>
              <span className="text-green-400">conducted </span>
              <span className="text-green-400">to </span>
              <span className="text-green-400">the </span>
              <span className="text-red-400 line-through decoration-red-400/50">middle</span>{" "}
              <span className="text-green-400 underline decoration-green-400/30">center </span>
              <span className="text-green-400">of </span>
              <span className="text-green-400">the </span>
              <span className="text-blue-400">lodge</span>
            </div>
            <div className="flex flex-wrap gap-3 mt-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-400" /> Correct</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400" /> Wrong</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-400" /> Phonetic match</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> Close enough</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-zinc-500" /> Missing</span>
            </div>
          </div>

          <DownArrow />
          <FlowStep
            icon="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
            color="blue"
            title="4. Hear corrections & feedback"
            desc='Press "Hear Corrections" to have the app read back the words you missed. You also get an encouraging feedback message based on your score.'
          />
        </div>
      </Section>

      {/* ================================================================ */}
      {/* 6. VOICE AI (TTS)                                                */}
      {/* ================================================================ */}
      <Section id="tts" title="Voice AI (Text-to-Speech)" subtitle="Three voice engines, each with unique voices per officer">
        <div className="max-w-2xl mx-auto">
          {/* Entry point */}
          <div className="flex justify-center mb-2">
            <div className="bg-zinc-800 border border-zinc-700 rounded-full px-5 py-2.5 text-sm text-zinc-300 font-medium">
              App needs to speak a line aloud
            </div>
          </div>

          <DownArrow />

          {/* Engine router */}
          <div className="flex justify-center mb-2">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-6 py-3 text-center">
              <p className="text-amber-300 font-semibold text-sm">Voice Engine Router</p>
              <p className="text-amber-400/50 text-xs mt-0.5">Sends to whichever engine you&apos;ve selected</p>
            </div>
          </div>

          {/* Three-way branch */}
          <div className="flex justify-center my-3">
            <svg width="240" height="30" className="text-zinc-600">
              <line x1="120" y1="0" x2="40" y2="28" stroke="currentColor" strokeWidth="1.5" />
              <line x1="120" y1="0" x2="120" y2="28" stroke="currentColor" strokeWidth="1.5" />
              <line x1="120" y1="0" x2="200" y2="28" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>

          {/* Three engines */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <EngineCard
              title="Browser"
              subtitle="Free, on-device"
              color="green"
              icon="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25"
              points={["Web Speech Synthesis API", "Varies pitch & speed per role", "Works offline", "No API key needed"]}
            />
            <EngineCard
              title="Google Cloud"
              subtitle="Premium Neural2 voices"
              color="blue"
              icon="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"
              points={["Different voice per role", "Natural-sounding Neural2", "Auto-retries on errors", "API key stays on server"]}
            />
            <EngineCard
              title="ElevenLabs"
              subtitle="Ultra-realistic voices"
              color="purple"
              icon="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
              points={["Human-like voice quality", "Unique voice per role", "Premium cloud service", "API key stays on server"]}
            />
          </div>

          <DownArrow />

          {/* Audio output */}
          <div className="flex justify-center">
            <div className="bg-zinc-800/60 border border-zinc-700 rounded-full px-6 py-3 flex items-center gap-3">
              <div className="flex gap-0.5 items-end h-5">
                <div className="w-1 bg-amber-500 rounded-full animate-pulse" style={{ height: "60%", animationDelay: "0ms" }} />
                <div className="w-1 bg-amber-500 rounded-full animate-pulse" style={{ height: "100%", animationDelay: "150ms" }} />
                <div className="w-1 bg-amber-500 rounded-full animate-pulse" style={{ height: "40%", animationDelay: "300ms" }} />
                <div className="w-1 bg-amber-500 rounded-full animate-pulse" style={{ height: "80%", animationDelay: "450ms" }} />
                <div className="w-1 bg-amber-500 rounded-full animate-pulse" style={{ height: "50%", animationDelay: "600ms" }} />
              </div>
              <span className="text-zinc-300 text-sm font-medium">Audio plays through your speaker</span>
            </div>
          </div>
        </div>

        {/* Voice mapping table */}
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-4 text-center">
            Each officer sounds different
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {[
              { role: "WM", name: "Worshipful Master", character: "Deep, authoritative", depth: "w-full" },
              { role: "SW", name: "Senior Warden", character: "Clear, measured", depth: "w-4/5" },
              { role: "JW", name: "Junior Warden", character: "Mid-range, steady", depth: "w-3/5" },
              { role: "SD", name: "Senior Deacon", character: "Slightly brighter", depth: "w-2/5" },
              { role: "JD", name: "Junior Deacon", character: "Crisp, British accent", depth: "w-1/4" },
              { role: "Chap", name: "Chaplain", character: "Deepest, slowest", depth: "w-full" },
              { role: "Tyler", name: "Tyler", character: "Higher, distinct", depth: "w-1/5" },
            ].map((v) => (
              <div key={v.role} className="bg-zinc-800/40 border border-zinc-700/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-amber-400 font-mono font-bold text-sm">{v.role}</span>
                  <span className="text-zinc-600 text-xs">{v.name}</span>
                </div>
                <p className="text-zinc-400 text-xs mb-2">{v.character}</p>
                <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div className={`h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full ${v.depth}`} />
                </div>
                <p className="text-zinc-600 text-[10px] mt-1">Voice depth</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ================================================================ */}
      {/* 7. AI COACH                                                      */}
      {/* ================================================================ */}
      <Section id="chat" title="AI Coach (Claude)" subtitle="Chat with an AI that knows your specific ritual text">
        <div className="max-w-lg mx-auto">
          {/* Example chat bubble */}
          <div className="bg-zinc-800/40 rounded-xl border border-zinc-700/50 p-5 mb-2">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg rounded-tl-none px-4 py-2.5">
                <p className="text-amber-200 text-sm">&ldquo;What comes after &lsquo;I was conducted to the center of the Lodge&rsquo;?&rdquo;</p>
              </div>
            </div>
          </div>

          <DownArrow />

          {/* Server processing */}
          <FlowStep
            icon="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z"
            color="purple"
            title="Sent to your server"
            desc="Your question goes to the app's server along with the plain text of your ritual (as context for the AI). Cipher text is never sent."
          >
            <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 mt-3 text-xs text-purple-300/70">
              <span className="text-purple-400 font-semibold">System prompt:</span> &ldquo;You are a patient Past Master and Masonic ritual coach. ONLY quote from this ritual text. NEVER reveal grips or passwords...&rdquo;
            </div>
          </FlowStep>

          <DownArrow />

          <FlowStep
            icon="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
            color="purple"
            title="Claude AI responds"
            desc="The response streams back in real time. You pick the model:"
          >
            <div className="flex flex-wrap gap-2 mt-3">
              <Tag>Haiku (fastest)</Tag>
              <Tag>Sonnet (balanced)</Tag>
              <Tag>Opus (smartest)</Tag>
            </div>
          </FlowStep>

          <DownArrow />

          {/* AI response bubble */}
          <div className="bg-zinc-800/40 rounded-xl border border-zinc-700/50 p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg rounded-tl-none px-4 py-2.5">
                <p className="text-purple-200 text-sm">&ldquo;The next line is: &lsquo;and there caused to kneel for the benefit of Lodge prayer.&rsquo; Would you like me to give you a hint for the prayer itself?&rdquo;</p>
              </div>
            </div>
            <p className="text-zinc-500 text-xs mt-3 ml-11">The AI can also read its response aloud using your selected voice engine.</p>
          </div>
        </div>
      </Section>

      {/* ================================================================ */}
      {/* 8. PRIVACY & SECURITY                                            */}
      {/* ================================================================ */}
      <Section id="privacy" title="Privacy & Security" subtitle="Your ritual text is treated with the discretion it deserves">
        <div className="grid md:grid-cols-2 gap-5">
          {/* Stays local */}
          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <div>
                <p className="text-green-300 font-semibold">Stays on your device</p>
                <p className="text-green-400/50 text-xs">Never transmitted anywhere</p>
              </div>
            </div>
            <ul className="space-y-3">
              <PrivacyItem color="green" text="Ritual cipher + plain text (AES-256, separate fields)" />
              <PrivacyItem color="green" text="Encryption key" />
              <PrivacyItem color="green" text="Practice scores & history" />
              <PrivacyItem color="green" text="Voice engine preference" />
              <PrivacyItem color="green" text="Browser speech recognition" />
              <PrivacyItem color="green" text="Browser voice playback" />
            </ul>
          </div>

          {/* Sent externally */}
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                </svg>
              </div>
              <div>
                <p className="text-amber-300 font-semibold">Sent to external services</p>
                <p className="text-amber-400/50 text-xs">Only when you use these features</p>
              </div>
            </div>
            <ul className="space-y-3">
              <PrivacyItem color="amber" text="AI Coach: plain text only goes to Claude API (never cipher)" />
              <PrivacyItem color="amber" text="Google TTS: line text for voice synthesis" />
              <PrivacyItem color="amber" text="ElevenLabs: line text for voice synthesis" />
            </ul>
            <div className="mt-4 pt-4 border-t border-amber-500/10">
              <ul className="space-y-2">
                <PrivacyItem color="green" text="API keys stay on the server (never in your browser)" />
                <PrivacyItem color="green" text="Anthropic does not train on API data" />
              </ul>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

/* ================================================================ */
/* Reusable visual components                                       */
/* ================================================================ */

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-zinc-100">{title}</h2>
        <p className="text-zinc-500 text-sm mt-1">{subtitle}</p>
      </div>
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 md:p-8">
        {children}
      </div>
    </section>
  );
}

function DownArrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-2">
      {label && <span className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">{label}</span>}
      <svg width="24" height="32" viewBox="0 0 24 32" className="text-zinc-600">
        <line x1="12" y1="0" x2="12" y2="24" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 20l6 8 6-8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function FlowStep({
  icon,
  color,
  title,
  desc,
  children,
}: {
  icon: string;
  color: "blue" | "amber" | "green" | "purple" | "red";
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  const colors = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    green: "bg-green-500/10 text-green-400 border-green-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  const iconBg = {
    blue: "bg-blue-500/10",
    amber: "bg-amber-500/10",
    green: "bg-green-500/10",
    purple: "bg-purple-500/10",
    red: "bg-red-500/10",
  };
  const iconColor = {
    blue: "text-blue-400",
    amber: "text-amber-400",
    green: "text-green-400",
    purple: "text-purple-400",
    red: "text-red-400",
  };

  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl ${iconBg[color]} flex items-center justify-center flex-shrink-0`}>
          <svg className={`w-5 h-5 ${iconColor[color]}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-200 text-sm">{title}</p>
          <p className="text-zinc-400 text-xs mt-1 leading-relaxed">{desc}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function MiniCard({ icon, label, color }: { icon: string; label: string; color: "zinc" | "blue" | "amber" | "purple" }) {
  const colors = {
    zinc: "border-zinc-700 bg-zinc-800/50",
    blue: "border-blue-500/20 bg-blue-500/5",
    amber: "border-amber-500/20 bg-amber-500/5",
    purple: "border-purple-500/20 bg-purple-500/5",
  };
  const iconColors = {
    zinc: "text-zinc-400",
    blue: "text-blue-400",
    amber: "text-amber-400",
    purple: "text-purple-400",
  };
  return (
    <div className={`rounded-lg border ${colors[color]} px-4 py-3 flex items-center gap-3`}>
      <svg className={`w-4 h-4 ${iconColors[color]} flex-shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      <span className="text-zinc-300 text-sm font-medium">{label}</span>
    </div>
  );
}

function ServiceCard({ label, desc, color }: { label: string; desc: string; color: "green" | "blue" | "purple" }) {
  const bg = { green: "bg-green-500/5 border-green-500/20", blue: "bg-blue-500/5 border-blue-500/20", purple: "bg-purple-500/5 border-purple-500/20" };
  const text = { green: "text-green-300", blue: "text-blue-300", purple: "text-purple-300" };
  const sub = { green: "text-green-400/50", blue: "text-blue-400/50", purple: "text-purple-400/50" };
  return (
    <div className={`rounded-xl border ${bg[color]} px-4 py-3 text-center`}>
      <p className={`text-sm font-semibold ${text[color]}`}>{label}</p>
      <p className={`text-xs ${sub[color]}`}>{desc}</p>
    </div>
  );
}

function EngineCard({ title, subtitle, color, icon, points }: { title: string; subtitle: string; color: "green" | "blue" | "purple"; icon: string; points: string[] }) {
  const colors = {
    green: { border: "border-green-500/20", bg: "bg-green-500/5", iconBg: "bg-green-500/10", iconText: "text-green-400", title: "text-green-300", sub: "text-green-400/50", dot: "bg-green-400" },
    blue: { border: "border-blue-500/20", bg: "bg-blue-500/5", iconBg: "bg-blue-500/10", iconText: "text-blue-400", title: "text-blue-300", sub: "text-blue-400/50", dot: "bg-blue-400" },
    purple: { border: "border-purple-500/20", bg: "bg-purple-500/5", iconBg: "bg-purple-500/10", iconText: "text-purple-400", title: "text-purple-300", sub: "text-purple-400/50", dot: "bg-purple-400" },
  };
  const c = colors[color];
  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-5`}>
      <div className={`w-10 h-10 rounded-xl ${c.iconBg} flex items-center justify-center mb-3`}>
        <svg className={`w-5 h-5 ${c.iconText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
      <p className={`font-semibold text-sm ${c.title}`}>{title}</p>
      <p className={`text-xs ${c.sub} mb-3`}>{subtitle}</p>
      <ul className="space-y-1.5">
        {points.map((pt) => (
          <li key={pt} className="flex items-start gap-2 text-xs text-zinc-400">
            <span className={`w-1.5 h-1.5 rounded-full ${c.dot} mt-1 flex-shrink-0`} />
            {pt}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BranchItem({ color, title, desc }: { color: "yellow" | "blue" | "zinc"; title: string; desc: string }) {
  const colors = {
    yellow: { bg: "bg-yellow-500/10", border: "border-yellow-500/20", icon: "text-yellow-400", title: "text-yellow-300" },
    blue: { bg: "bg-blue-500/10", border: "border-blue-500/20", icon: "text-blue-400", title: "text-blue-300" },
    zinc: { bg: "bg-zinc-700/30", border: "border-zinc-600/30", icon: "text-zinc-400", title: "text-zinc-300" },
  };
  const c = colors[color];
  return (
    <div className={`${c.bg} border ${c.border} rounded-lg px-4 py-3`}>
      <p className={`${c.title} font-semibold text-sm mb-1`}>{title}</p>
      <p className="text-zinc-400 text-xs leading-relaxed">{desc}</p>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2.5 py-1 bg-zinc-700/50 text-zinc-400 rounded-md text-xs font-medium">
      {children}
    </span>
  );
}

function ScoreLabel({ color, label, example }: { color: "green" | "red" | "blue" | "yellow"; label: string; example?: string }) {
  const dot = { green: "bg-green-400", red: "bg-red-400", blue: "bg-blue-400", yellow: "bg-yellow-400" };
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${dot[color]} flex-shrink-0`} />
      <span className="text-zinc-400 text-xs">{label}</span>
      {example && <span className="text-zinc-600 text-xs">({example})</span>}
    </div>
  );
}

function PrivacyItem({ color, text }: { color: "green" | "amber"; text: string }) {
  const icon = color === "green"
    ? "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    : "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z";
  const iconColor = color === "green" ? "text-green-400/70" : "text-amber-400/70";
  return (
    <li className="flex items-start gap-2.5">
      <svg className={`w-4 h-4 ${iconColor} flex-shrink-0 mt-0.5`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      <span className="text-zinc-300 text-sm">{text}</span>
    </li>
  );
}
