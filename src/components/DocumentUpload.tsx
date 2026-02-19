"use client";

import { useState, useCallback, useRef } from "react";
import { decryptMRAM, isMRAMFile } from "@/lib/mram-format";
import { saveMRAMDocument } from "@/lib/storage";

interface DocumentUploadProps {
  onDocumentSaved: (docId: string, title: string, sectionCount: number) => void;
}

type UploadStage = "idle" | "passphrase" | "processing";

export default function DocumentUpload({ onDocumentSaved }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");

  const fileDataRef = useRef<ArrayBuffer | null>(null);
  const passphraseInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setProgress("Reading file...");

      try {
        const data = await file.arrayBuffer();

        // Validate it's a .mram file
        if (!isMRAMFile(data)) {
          setError(
            "This is not a valid .mram ritual file. Only encrypted ritual files from your lodge are accepted."
          );
          setStage("idle");
          setProgress(null);
          return;
        }

        // Store file data and prompt for passphrase
        fileDataRef.current = data;
        setStage("passphrase");
        setProgress(null);
        // Focus passphrase input after render
        setTimeout(() => passphraseInputRef.current?.focus(), 100);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to read file."
        );
        setStage("idle");
        setProgress(null);
      }
    },
    []
  );

  const handleDecrypt = useCallback(async () => {
    if (!fileDataRef.current || !passphrase) return;

    setStage("processing");
    setError(null);
    setProgress("Decrypting ritual file...");

    try {
      const mramDoc = await decryptMRAM(fileDataRef.current, passphrase);

      setProgress(
        `Found ${mramDoc.lines.length} lines in ${mramDoc.sections.length} sections. Encrypting and saving...`
      );

      const docId = await saveMRAMDocument(mramDoc);
      const title = `${mramDoc.metadata.degree} - ${mramDoc.metadata.ceremony}`;

      setProgress(null);
      setPassphrase("");
      fileDataRef.current = null;
      setStage("idle");
      onDocumentSaved(docId, title, mramDoc.lines.length);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to decrypt file. Check your passphrase and try again."
      );
      setStage("passphrase");
      setProgress(null);
    }
  }, [passphrase, onDocumentSaved]);

  const handleCancel = useCallback(() => {
    fileDataRef.current = null;
    setPassphrase("");
    setStage("idle");
    setError(null);
    setProgress(null);
  }, []);

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

  // Passphrase entry stage
  if (stage === "passphrase") {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
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
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-zinc-200">
            Enter Lodge Passphrase
          </h3>
          <p className="text-sm text-zinc-500 mt-2">
            This ritual file is encrypted. Enter the passphrase provided by your lodge to unlock it.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleDecrypt();
          }}
          className="max-w-sm mx-auto space-y-4"
        >
          <input
            ref={passphraseInputRef}
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Lodge passphrase"
            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 text-center"
            autoComplete="off"
          />
          <div className="flex gap-3 justify-center">
            <button
              type="submit"
              disabled={!passphrase.trim()}
              className="px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg font-medium transition-colors"
            >
              Unlock
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`
        border-2 border-dashed rounded-xl p-12 text-center transition-all
        ${isDragging
          ? "border-amber-500 bg-amber-500/10"
          : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/50"
        }
        ${stage === "processing" ? "pointer-events-none opacity-70" : "cursor-pointer"}
      `}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => {
        if (stage !== "processing") {
          document.getElementById("file-input")?.click();
        }
      }}
    >
      <input
        id="file-input"
        type="file"
        className="hidden"
        accept=".mram"
        onChange={handleFileInput}
      />

      {stage === "processing" ? (
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
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <div>
            <p className="text-lg font-medium text-zinc-200">
              Drop your encrypted ritual file here
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              Accepts .mram files only
            </p>
            <p className="text-xs text-zinc-600 mt-2">
              Your ritual file is decrypted and re-encrypted entirely on your device.
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
