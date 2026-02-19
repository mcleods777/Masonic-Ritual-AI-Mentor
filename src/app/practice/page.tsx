"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PracticeMode from "@/components/PracticeMode";
import RehearsalMode from "@/components/RehearsalMode";
import ListenMode from "@/components/ListenMode";
import {
  listDocuments,
  getDocumentSections,
  type StoredDocument,
  type RitualSectionWithCipher,
} from "@/lib/storage";
import TTSEngineSelector from "@/components/TTSEngineSelector";

type PracticeTab = "solo" | "rehearsal" | "listen";

function PracticeContent() {
  const searchParams = useSearchParams();
  const docId = searchParams.get("doc");

  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(docId);
  const [sections, setSections] = useState<RitualSectionWithCipher[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PracticeTab>("rehearsal");

  // Check if document has multiple speakers (needed for rehearsal)
  const hasMultipleSpeakers = new Set(
    sections.filter((s) => s.speaker).map((s) => s.speaker)
  ).size > 1;

  // Load documents list
  useEffect(() => {
    listDocuments()
      .then((docs) => {
        setDocuments(docs);
        // Auto-select first document if none specified
        if (!selectedDocId && docs.length > 0) {
          setSelectedDocId(docs[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedDocId]);

  // Load sections when document changes
  useEffect(() => {
    if (!selectedDocId) return;
    setLoading(true);
    getDocumentSections(selectedDocId)
      .then(setSections)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedDocId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-zinc-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-zinc-300">
          No Documents Uploaded
        </h2>
        <p className="text-zinc-500 mt-2 max-w-md mx-auto">
          Upload your encrypted ritual file first so you can practice reciting
          from memory.
        </p>
        <Link
          href="/upload"
          className="inline-block mt-6 px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors"
        >
          Upload Ritual
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Practice Mode</h1>
          <p className="text-zinc-500 mt-1">
            {activeTab === "rehearsal"
              ? "Pick your role and rehearse the full ceremony with AI reading the other parts."
              : activeTab === "listen"
                ? "Listen to the full ceremony read aloud, each officer in a distinct voice."
                : "Select a section, then speak or type from memory."}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Voice engine selector */}
          <TTSEngineSelector />

          {/* Document selector */}
          {documents.length > 1 && (
            <select
              value={selectedDocId || ""}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-amber-500"
            >
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex bg-zinc-800/50 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("rehearsal")}
          className={`
            px-5 py-2 rounded-md text-sm font-medium transition-all
            ${activeTab === "rehearsal"
              ? "bg-amber-600 text-white shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"}
          `}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Rehearsal
          </span>
        </button>
        <button
          onClick={() => setActiveTab("listen")}
          className={`
            px-5 py-2 rounded-md text-sm font-medium transition-all
            ${activeTab === "listen"
              ? "bg-amber-600 text-white shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"}
          `}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 12h.01M9 10a3 3 0 016 0v4a3 3 0 01-6 0v-4z" />
            </svg>
            Listen
          </span>
        </button>
        <button
          onClick={() => setActiveTab("solo")}
          className={`
            px-5 py-2 rounded-md text-sm font-medium transition-all
            ${activeTab === "solo"
              ? "bg-amber-600 text-white shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"}
          `}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
            Solo Practice
          </span>
        </button>
      </div>

      {sections.length > 0 ? (
        activeTab === "rehearsal" && hasMultipleSpeakers ? (
          <RehearsalMode sections={sections} />
        ) : activeTab === "rehearsal" && !hasMultipleSpeakers ? (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 text-center">
            <p className="text-zinc-400">
              Rehearsal mode requires a document with multiple speaker roles.
              This document doesn&apos;t have distinct speaker prefixes.
            </p>
            <button
              onClick={() => setActiveTab("solo")}
              className="mt-4 px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors"
            >
              Switch to Solo Practice
            </button>
          </div>
        ) : activeTab === "listen" && hasMultipleSpeakers ? (
          <ListenMode sections={sections} />
        ) : activeTab === "listen" && !hasMultipleSpeakers ? (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 text-center">
            <p className="text-zinc-400">
              Listen mode requires a document with multiple speaker roles.
            </p>
            <button
              onClick={() => setActiveTab("solo")}
              className="mt-4 px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors"
            >
              Switch to Solo Practice
            </button>
          </div>
        ) : (
          <PracticeMode sections={sections} />
        )
      ) : (
        <div className="text-center py-12 text-zinc-500">
          <p>No sections found in this document.</p>
          <p className="text-sm mt-1">
            Try uploading a different file or check that the document is a valid .mram file.
          </p>
        </div>
      )}
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <PracticeContent />
    </Suspense>
  );
}
