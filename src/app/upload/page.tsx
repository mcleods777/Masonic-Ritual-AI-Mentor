"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DocumentUpload from "@/components/DocumentUpload";
import {
  listDocuments,
  deleteDocument,
  type StoredDocument,
} from "@/lib/storage";

export default function UploadPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    listDocuments().then(setDocuments).catch(console.error);
  }, []);

  const handleDocumentSaved = (docId: string, title: string, sectionCount: number) => {
    setSuccessMessage(
      `"${title}" uploaded successfully with ${sectionCount} lines detected.`
    );
    listDocuments().then(setDocuments);

    // Auto-navigate to practice after 2 seconds
    setTimeout(() => {
      router.push(`/practice?doc=${docId}`);
    }, 2000);
  };

  const handleDelete = async (docId: string) => {
    await deleteDocument(docId);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Upload Ritual</h1>
        <p className="text-zinc-500 mt-2">
          Upload your encrypted ritual file (.mram). It will be decrypted,
          structured into practice sections, and re-encrypted on your device.
        </p>
      </div>

      <DocumentUpload onDocumentSaved={handleDocumentSaved} />

      {successMessage && (
        <div className="p-4 bg-green-900/30 border border-green-700/50 rounded-xl text-green-300">
          <p className="font-medium">{successMessage}</p>
          <p className="text-sm text-green-400/70 mt-1">
            Redirecting to practice mode...
          </p>
        </div>
      )}

      {/* Existing documents */}
      {documents.length > 0 && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h2 className="text-lg font-semibold text-zinc-200 mb-4">
            Uploaded Documents
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
                    {doc.sectionCount} lines &middot;{" "}
                    {new Date(doc.createdAt).toLocaleDateString()}
                    {doc.isMRAM && (
                      <span className="ml-2 text-amber-500/70">.mram</span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/practice?doc=${doc.id}`)}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Practice
                  </button>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="px-3 py-1.5 bg-zinc-700 hover:bg-red-600 text-zinc-300 hover:text-white rounded-lg text-sm transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File format info */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">
          About .mram Files
        </h3>
        <div className="px-3 py-2 bg-zinc-800/50 rounded-lg text-center mb-4">
          <p className="text-amber-400 font-mono font-bold">.mram</p>
          <p className="text-xs text-zinc-500 mt-1">Encrypted ritual file</p>
        </div>
        <p className="text-xs text-zinc-600">
          Ritual files (.mram) are encrypted and can only be opened with the
          correct passphrase from your lodge. They contain both the cipher text
          for practice and the full text for AI coaching, securely bundled
          together. Contact your lodge secretary for the file and passphrase.
        </p>
      </div>
    </div>
  );
}
