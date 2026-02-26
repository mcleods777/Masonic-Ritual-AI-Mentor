"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import ChatInterface from "@/components/ChatInterface";
import {
  listDocuments,
  getDocumentPlainText,
  type StoredDocument,
} from "@/lib/storage";

export default function ChatPage() {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [ritualContext, setRitualContext] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Load documents list
  useEffect(() => {
    listDocuments()
      .then((docs) => {
        setDocuments(docs);
        if (docs.length > 0) {
          setSelectedDocId(docs[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Load plain text only (NEVER cipher) for AI context
  useEffect(() => {
    if (!selectedDocId) return;
    getDocumentPlainText(selectedDocId)
      .then(setRitualContext)
      .catch(console.error);
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
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-zinc-300">
          Upload a Document First
        </h2>
        <p className="text-zinc-500 mt-2 max-w-md mx-auto">
          The AI coach needs your ritual document to provide accurate
          guidance and corrections.
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
    <div className="space-y-4 h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">AI Ritual Coach</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Ask questions, get hints, or have the coach quiz you.
          </p>
        </div>

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

      <div className="h-[calc(100%-4rem)]">
        <ChatInterface ritualContext={ritualContext} />
      </div>
    </div>
  );
}
