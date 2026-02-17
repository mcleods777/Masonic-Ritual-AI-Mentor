"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PracticeMode from "@/components/PracticeMode";
import {
  listDocuments,
  getDocumentSections,
  type StoredDocument,
} from "@/lib/storage";
import type { RitualSection } from "@/lib/document-parser";

function PracticeContent() {
  const searchParams = useSearchParams();
  const docId = searchParams.get("doc");

  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(docId);
  const [sections, setSections] = useState<RitualSection[]>([]);
  const [loading, setLoading] = useState(true);

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
          Upload your ritual document first so you can practice reciting
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Practice Mode</h1>
          <p className="text-zinc-500 mt-1">
            Select a section, then speak or type from memory.
          </p>
        </div>

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

      {sections.length > 0 ? (
        <PracticeMode sections={sections} />
      ) : (
        <div className="text-center py-12 text-zinc-500">
          <p>No sections found in this document.</p>
          <p className="text-sm mt-1">
            Try uploading a different format or check that the document contains
            ritual text.
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
