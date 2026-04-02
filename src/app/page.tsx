"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listDocuments, type StoredDocument } from "@/lib/storage";

export default function HomePage() {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDocuments()
      .then(setDocuments)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const hasDocuments = documents.length > 0;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center py-6 md:py-20 animate-fade-up">
        <div className="hidden md:flex w-20 h-20 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 items-center justify-center mb-6">
          <svg className="w-10 h-10 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h1 className="text-3xl md:text-5xl font-bold text-zinc-100 tracking-tight">
          Masonic Ritual Mentor
        </h1>
        <p className="text-base md:text-lg text-zinc-400 mt-3 md:mt-4 max-w-2xl mx-auto">
          Practice your ritual work from memory. Upload your encrypted
          .mram file and get instant voice feedback.
        </p>
      </div>

      {/* Primary Action */}
      <Link
        href="/upload"
        className="group block bg-zinc-900 rounded-xl border border-zinc-800 hover:border-amber-500/50 p-6 md:p-8 transition-all animate-fade-up-delay-1"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-semibold text-zinc-200 group-hover:text-amber-400 transition-colors">
              Upload Your Ritual
            </h2>
            <p className="text-sm md:text-base text-zinc-500 mt-1 md:mt-2 max-w-lg">
              Upload your encrypted .mram file. Decrypted on your device,
              never leaves your browser.
            </p>
          </div>
          <span className="shrink-0 w-full md:w-auto px-6 py-3 bg-amber-600 group-hover:bg-amber-500 text-white rounded-lg font-medium transition-colors text-center">
            Upload .mram File
          </span>
        </div>
      </Link>

      {/* Secondary Actions */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 animate-fade-up-delay-2">
        <Link
          href="/practice"
          className={`group flex flex-col md:flex-row items-start gap-2 md:gap-4 bg-zinc-900 rounded-xl border border-zinc-800 hover:border-amber-500/50 p-4 md:p-6 transition-all ${
            !hasDocuments && !loading ? "opacity-50" : ""
          }`}
        >
          <svg
            className="w-5 h-5 text-amber-500 mt-0.5 shrink-0"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
          <div>
            <h3 className="text-lg font-semibold text-zinc-200 group-hover:text-amber-400 transition-colors">
              Practice Mode
            </h3>
            <p className="hidden md:block text-sm text-zinc-500 mt-1">
              Speak or type from memory and get word-by-word accuracy
              feedback with voice corrections.
            </p>
          </div>
        </Link>

        <Link
          href="/progress"
          className="group flex flex-col md:flex-row items-start gap-2 md:gap-4 bg-zinc-900 rounded-xl border border-zinc-800 hover:border-amber-500/50 p-4 md:p-6 transition-all"
        >
          <svg
            className="w-5 h-5 text-amber-500 mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <div>
            <h3 className="text-lg font-semibold text-zinc-200 group-hover:text-amber-400 transition-colors">
              Progress
            </h3>
            <p className="hidden md:block text-sm text-zinc-500 mt-1">
              Track your accuracy over time, see trends, and identify
              persistent trouble spots.
            </p>
          </div>
        </Link>
      </div>

      {/* Documents list */}
      {!loading && hasDocuments && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h2 className="text-2xl font-semibold text-zinc-200 mb-4">
            Your Documents
          </h2>
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 rounded-lg"
              >
                <div>
                  <p className="text-zinc-200 font-medium">{doc.title}</p>
                  <p className="text-xs text-zinc-500">
                    {doc.sectionCount} sections &middot; Uploaded{" "}
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Link
                  href={`/practice?doc=${doc.id}`}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Practice
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How it Works */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
        <h2 className="text-2xl font-semibold text-zinc-200 mb-6">
          How It Works
        </h2>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
          {[
            {
              step: "1",
              title: "Upload",
              desc: "Upload your encrypted .mram file and enter your lodge passphrase. Decrypted on your device.",
            },
            {
              step: "2",
              title: "Select",
              desc: "Choose a section to practice. Cipher text is shown by default, toggle to reveal plain text.",
            },
            {
              step: "3",
              title: "Recite",
              desc: "Speak your lines aloud or type from memory. The app transcribes your words in real time.",
            },
            {
              step: "4",
              title: "Review",
              desc: "Get word-by-word accuracy scoring, hear the correct version, and track your progress.",
            },
          ].map((item) => (
            <div key={item.step} className="flex items-baseline gap-3 py-2">
              <span className="text-amber-500/60 font-mono text-sm shrink-0">
                {item.step}.
              </span>
              <div>
                <h3 className="font-semibold text-zinc-200 inline">{item.title}</h3>
                <span className="text-zinc-500 ml-1">&mdash;</span>
                <p className="text-sm text-zinc-500 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Privacy Notice */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex-shrink-0 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-200">
              Privacy First
            </h3>
            <p className="text-sm text-zinc-500 mt-1">
              Your .mram ritual file is decrypted on your device, then re-encrypted
              with AES-256-GCM and stored in IndexedDB. Cipher text and plain text are
              kept in separate encrypted fields — cipher is shown to you, plain text
              is only used for accuracy comparison. Anthropic does not use API data
              for training.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
