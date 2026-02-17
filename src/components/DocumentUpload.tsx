"use client";

import { useState, useCallback } from "react";
import { parseDocument, type ParsedDocument } from "@/lib/document-parser";
import { saveDocument } from "@/lib/storage";

interface DocumentUploadProps {
  onDocumentSaved: (docId: string, doc: ParsedDocument) => void;
}

export default function DocumentUpload({ onDocumentSaved }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsProcessing(true);
      setProgress("Parsing document...");

      try {
        const parsed = await parseDocument(file);
        setProgress(
          `Found ${parsed.sections.length} sections. Encrypting and saving...`
        );

        const docId = await saveDocument(parsed);
        setProgress(null);
        onDocumentSaved(docId, parsed);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to parse document. Please try a different file format."
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [onDocumentSaved]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div
      className={`
        border-2 border-dashed rounded-xl p-12 text-center transition-all
        ${isDragging
          ? "border-amber-500 bg-amber-500/10"
          : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/50"
        }
        ${isProcessing ? "pointer-events-none opacity-70" : "cursor-pointer"}
      `}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => {
        if (!isProcessing) {
          document.getElementById("file-input")?.click();
        }
      }}
    >
      <input
        id="file-input"
        type="file"
        className="hidden"
        accept=".pdf,.docx,.txt,.md,.rtf"
        onChange={handleFileInput}
      />

      {isProcessing ? (
        <div className="space-y-4">
          <div className="w-12 h-12 mx-auto border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-300">{progress}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <div>
            <p className="text-lg font-medium text-zinc-200">
              Drop your ritual document here
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              Supports PDF, DOCX, and TXT files
            </p>
            <p className="text-xs text-zinc-600 mt-2">
              Your document is parsed and encrypted entirely on your device.
              It never leaves your browser.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
