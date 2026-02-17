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
      <div className="text-center py-12 md:py-20">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-zinc-100 tracking-tight">
          Masonic Ritual Mentor
        </h1>
        <p className="text-lg text-zinc-400 mt-4 max-w-2xl mx-auto">
          A privacy-first practice tool for memorizing your ritual work.
          Upload your ritual, speak your lines, and get instant feedback
          with AI coaching.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <Link
          href="/upload"
          className="group bg-zinc-900 rounded-xl border border-zinc-800 hover:border-amber-500/50 p-6 transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4 group-hover:bg-amber-500/20 transition-colors">
            <svg
              className="w-6 h-6 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-zinc-200 group-hover:text-amber-400 transition-colors">
            Upload Ritual
          </h3>
          <p className="text-sm text-zinc-500 mt-2">
            Upload your ritual document. It&apos;s parsed and encrypted entirely
            on your device — it never leaves your browser.
          </p>
        </Link>

        <Link
          href="/practice"
          className={`group bg-zinc-900 rounded-xl border border-zinc-800 hover:border-amber-500/50 p-6 transition-all ${
            !hasDocuments && !loading ? "opacity-50" : ""
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4 group-hover:bg-amber-500/20 transition-colors">
            <svg
              className="w-6 h-6 text-amber-500"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-zinc-200 group-hover:text-amber-400 transition-colors">
            Practice Mode
          </h3>
          <p className="text-sm text-zinc-500 mt-2">
            Recite from memory — speak or type your lines and get
            word-by-word accuracy feedback with voice corrections.
          </p>
        </Link>

        <Link
          href="/chat"
          className={`group bg-zinc-900 rounded-xl border border-zinc-800 hover:border-amber-500/50 p-6 transition-all ${
            !hasDocuments && !loading ? "opacity-50" : ""
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4 group-hover:bg-amber-500/20 transition-colors">
            <svg
              className="w-6 h-6 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-zinc-200 group-hover:text-amber-400 transition-colors">
            AI Coach
          </h3>
          <p className="text-sm text-zinc-500 mt-2">
            Chat with a patient AI coach who knows your ritual. Ask
            questions, get hints, or have it quiz you on the catechism.
          </p>
        </Link>
      </div>

      {/* Documents list */}
      {!loading && hasDocuments && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h2 className="text-lg font-semibold text-zinc-200 mb-4">
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
        <h2 className="text-lg font-semibold text-zinc-200 mb-6">
          How It Works
        </h2>
        <div className="grid md:grid-cols-4 gap-6">
          {[
            {
              step: "1",
              title: "Upload",
              desc: "Upload your Iowa Masonic ritual (PDF, DOCX, or TXT). It's parsed entirely on your device.",
            },
            {
              step: "2",
              title: "Select",
              desc: "Choose a degree and section to practice. The app automatically detects sections and speakers.",
            },
            {
              step: "3",
              title: "Recite",
              desc: "Speak your lines aloud or type from memory. The app transcribes your words in real time.",
            },
            {
              step: "4",
              title: "Review",
              desc: "Get word-by-word accuracy scoring, hear the correct version, and chat with the AI coach.",
            },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="w-10 h-10 mx-auto rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-lg mb-3">
                {item.step}
              </div>
              <h3 className="font-semibold text-zinc-200">{item.title}</h3>
              <p className="text-sm text-zinc-500 mt-1">{item.desc}</p>
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
            <h3 className="text-sm font-semibold text-zinc-200">
              Privacy First
            </h3>
            <p className="text-sm text-zinc-500 mt-1">
              Your ritual document is parsed and encrypted entirely on your device
              using AES-256-GCM encryption. It is stored in your browser&apos;s
              IndexedDB and never sent to any server. Speech recognition runs
              on-device when possible. The AI coach only receives the specific
              section you&apos;re practicing, and Anthropic does not use API data for
              training.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
