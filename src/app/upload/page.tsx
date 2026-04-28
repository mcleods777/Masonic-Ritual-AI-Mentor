"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Loader2,
  Lock,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  decryptMRAM,
  isMRAMFile,
  MRAMExpiredError,
  type MRAMDocument,
} from "@/lib/mram-format";
import {
  deleteDocument,
  listDocuments,
  saveMRAMDocument,
  type StoredDocument,
} from "@/lib/storage";

type Stage = "idle" | "decrypting" | "preview";

type DecryptStep = "decrypting" | "verifying" | "parsing" | "storing";

const STEP_LABEL: Record<DecryptStep, string> = {
  decrypting: "Decrypting…",
  verifying: "Verifying integrity…",
  parsing: "Parsing sections…",
  storing: "Storing securely…",
};

/**
 * Wrap a state mutation in the browser View Transitions API when available.
 * Honors prefers-reduced-motion (the API itself does this in most browsers,
 * but we also short-circuit here so non-supporting browsers don't pay the
 * cost on a media query they couldn't honor anyway).
 */
function withTransition(fn: () => void) {
  if (typeof document === "undefined") {
    fn();
    return;
  }
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!reduced && typeof document.startViewTransition === "function") {
    document.startViewTransition(() => fn());
  } else {
    fn();
  }
}

export default function UploadPage() {
  const router = useRouter();

  // Stage machine
  const [stage, setStage] = useState<Stage>("idle");

  // Idle state
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Decrypting state
  const [decryptStep, setDecryptStep] = useState<DecryptStep>("decrypting");
  const [decryptPct, setDecryptPct] = useState(0);

  // Preview state
  const [doc, setDoc] = useState<MRAMDocument | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  // Document list (existing in IndexedDB)
  const [documents, setDocuments] = useState<StoredDocument[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const passphraseInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listDocuments().then(setDocuments).catch(console.error);
  }, []);

  const refreshDocuments = useCallback(() => {
    listDocuments().then(setDocuments).catch(console.error);
  }, []);

  const resetToIdle = useCallback(() => {
    withTransition(() => {
      setStage("idle");
      setFile(null);
      setPassphrase("");
      setDecryptStep("decrypting");
      setDecryptPct(0);
      setDoc(null);
      setDocId(null);
      setSelectedSectionId(null);
      setError(null);
    });
  }, []);

  const handleFile = useCallback((f: File) => {
    setError(null);
    setFile(f);
    setTimeout(() => passphraseInputRef.current?.focus(), 0);
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!file || !passphrase.trim()) return;
      setError(null);

      withTransition(() => setStage("decrypting"));
      setDecryptStep("decrypting");
      setDecryptPct(10);

      try {
        const data = await file.arrayBuffer();

        if (!isMRAMFile(data)) {
          withTransition(() => setStage("idle"));
          setError(
            "This is not a valid .mram ritual file. Only encrypted ritual files from your lodge are accepted.",
          );
          return;
        }

        // The decryptMRAM call performs AES-GCM verification + JSON parsing
        // + checksum check internally. We can't observe sub-step progress
        // from here, so the progress bar approximates step-by-step.
        setDecryptStep("verifying");
        setDecryptPct(40);

        const mramDoc = await decryptMRAM(data, passphrase);

        setDecryptStep("parsing");
        setDecryptPct(70);

        // Yield to the event loop so the progress paint actually lands
        // before saveMRAMDocument blocks on IndexedDB.
        await new Promise((r) => setTimeout(r, 0));

        setDecryptStep("storing");
        setDecryptPct(90);

        const id = await saveMRAMDocument(mramDoc);

        setDecryptPct(100);
        await new Promise((r) => setTimeout(r, 120));

        withTransition(() => {
          setDoc(mramDoc);
          setDocId(id);
          setSelectedSectionId(mramDoc.sections[0]?.id ?? null);
          setStage("preview");
        });
        refreshDocuments();
      } catch (err) {
        if (err instanceof MRAMExpiredError) {
          withTransition(() => setStage("idle"));
          setError(err.message);
          setFile(null);
          setPassphrase("");
        } else {
          withTransition(() => setStage("idle"));
          setError("Passphrase did not decrypt this file.");
          setPassphrase("");
          setTimeout(() => passphraseInputRef.current?.focus(), 0);
        }
      }
    },
    [file, passphrase, refreshDocuments],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    },
    [],
  );

  const continueToPractice = useCallback(() => {
    if (!docId) return;
    router.push(`/practice?doc=${docId}`);
  }, [docId, router]);

  /* ============================================================
   * State 3: Preview — section selector + side-by-side cipher/plain.
   * Lines for the selected section, both columns font-mono.
   * ============================================================ */
  const linesForSection = useMemo(() => {
    if (!doc || !selectedSectionId) return [];
    return doc.lines.filter((l) => l.section === selectedSectionId);
  }, [doc, selectedSectionId]);

  /* ============================================================
   * Render
   * ============================================================ */

  if (stage === "decrypting") {
    return (
      <div className="max-w-2xl mx-auto pt-16">
        <PageHeader />
        <Card className="mt-12 px-6">
          <CardHeader>
            <CardTitle className="font-cinzel uppercase tracking-[0.18em] text-base text-zinc-100">
              Decrypting
            </CardTitle>
            <CardDescription>
              Working entirely on this device. Your passphrase is not transmitted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 text-sm text-zinc-300">
              <Loader2
                className="size-4 text-amber-500 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              <span aria-live="polite">{STEP_LABEL[decryptStep]}</span>
            </div>
            <Progress value={decryptPct} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (stage === "preview" && doc) {
    return (
      <div className="max-w-6xl mx-auto pt-16 space-y-8">
        <PageHeader />

        <Card className="px-6">
          <CardHeader>
            <CardTitle className="font-cinzel uppercase tracking-[0.18em] text-base text-zinc-100">
              Verify decrypted content
            </CardTitle>
            <CardDescription>
              {doc.metadata.degree} — {doc.metadata.ceremony}. {doc.lines.length} lines across {doc.sections.length} section{doc.sections.length === 1 ? "" : "s"}. Confirm a section reads correctly, then continue to practice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Section selector */}
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sections">
              {doc.sections.map((s) => {
                const active = s.id === selectedSectionId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedSectionId(s.id)}
                    className={[
                      "rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors",
                      active
                        ? "bg-amber-600 text-white"
                        : "bg-card text-muted-foreground hover:text-zinc-100 ring-1 ring-foreground/10 hover:ring-foreground/20",
                    ].join(" ")}
                  >
                    {s.title}
                  </button>
                );
              })}
            </div>

            {/* Side-by-side preview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg ring-1 ring-foreground/10 bg-card overflow-hidden">
                <div className="px-4 py-2 border-b border-foreground/10 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Cipher (shown to you)
                </div>
                <div className="px-4 py-3 max-h-96 overflow-y-auto font-mono text-sm leading-relaxed text-zinc-200 space-y-2">
                  {linesForSection.length === 0 ? (
                    <p className="text-muted-foreground">No lines in this section.</p>
                  ) : (
                    linesForSection.map((l) => (
                      <div key={`c-${l.id}`} className="flex gap-3">
                        <span className="text-amber-500/60 shrink-0 w-12">
                          {l.role}
                        </span>
                        <span className="break-words">
                          {l.action ? (
                            <em className="text-muted-foreground">{l.action}</em>
                          ) : (
                            l.cipher
                          )}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-lg ring-1 ring-foreground/10 bg-card overflow-hidden">
                <div className="px-4 py-2 border-b border-foreground/10 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Plain (used by AI)
                </div>
                <div className="px-4 py-3 max-h-96 overflow-y-auto font-mono text-sm leading-relaxed text-zinc-200 space-y-2">
                  {linesForSection.length === 0 ? (
                    <p className="text-muted-foreground">No lines in this section.</p>
                  ) : (
                    linesForSection.map((l) => (
                      <div key={`p-${l.id}`} className="flex gap-3">
                        <span className="text-amber-500/60 shrink-0 w-12">
                          {l.role}
                        </span>
                        <span className="break-words">
                          {l.action ? (
                            <em className="text-muted-foreground">{l.action}</em>
                          ) : (
                            l.plain
                          )}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={resetToIdle}
                className="text-muted-foreground hover:text-zinc-100"
              >
                Upload a different file
              </Button>
              <Button
                type="button"
                onClick={continueToPractice}
                className="bg-amber-600 hover:bg-amber-500 text-white"
              >
                Continue to practice
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ============================================================
   * State 1: Idle — drop zone + passphrase + privacy block.
   * ============================================================ */
  return (
    <div className="max-w-2xl mx-auto pt-16 space-y-8">
      <PageHeader />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Decryption failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="px-6">
        <CardHeader>
          <CardTitle className="font-cinzel uppercase tracking-[0.18em] text-base text-zinc-100">
            Upload encrypted ritual
          </CardTitle>
          <CardDescription>
            Pick your encrypted .mram file and enter your lodge passphrase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Drop zone */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Choose a .mram ritual file"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
              className={[
                "rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                isDragging
                  ? "border-amber-500 bg-amber-500/5"
                  : file
                    ? "border-amber-500/30 bg-card"
                    : "border-foreground/15 hover:border-foreground/25 bg-card",
              ].join(" ")}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".mram"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Upload
                className="size-8 text-amber-500 mx-auto mb-3"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              {file ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-100">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB · click or drop to replace
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-zinc-200">
                    Drop your .mram file here, or click to choose one
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Encrypted ritual files only
                  </p>
                </div>
              )}
            </div>

            {/* Passphrase */}
            <div className="space-y-2">
              <label
                htmlFor="passphrase"
                className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
              >
                Lodge passphrase
              </label>
              <Input
                id="passphrase"
                ref={passphraseInputRef}
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter the passphrase from your lodge"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(error)}
                disabled={!file}
                className="h-10"
              />
            </div>

            {/* Privacy block */}
            <div className="flex items-start gap-2.5 rounded-lg ring-1 ring-foreground/10 bg-card px-4 py-3">
              <ShieldCheck
                className="size-4 text-amber-500 shrink-0 mt-0.5"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Decryption happens on this device. Your passphrase is never transmitted.
              </p>
            </div>

            <Button
              type="submit"
              disabled={!file || !passphrase.trim()}
              className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-muted disabled:text-muted-foreground text-white h-10"
            >
              Decrypt and preview
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Existing documents */}
      {documents.length > 0 && (
        <Card className="px-6">
          <CardHeader>
            <CardTitle className="font-cinzel uppercase tracking-[0.18em] text-base text-zinc-100">
              Already on this device
            </CardTitle>
            <CardDescription>
              Rituals you have already decrypted and stored.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {documents.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-lg ring-1 ring-foreground/10 bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">
                      {d.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.sectionCount} lines · {new Date(d.createdAt).toLocaleDateString()}
                      {d.isMRAM && (
                        <span className="ml-2 text-amber-500/70 font-mono">.mram</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => router.push(`/practice?doc=${d.id}`)}
                      className="bg-amber-600 hover:bg-amber-500 text-white"
                    >
                      Rehearse
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(d.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ============================================================
 * Sub-components
 * ============================================================ */

function PageHeader() {
  return (
    <div className="space-y-3">
      <h1 className="font-cinzel uppercase tracking-[0.2em] text-2xl md:text-3xl text-zinc-100">
        Upload Ritual File
      </h1>
      <p className="text-sm text-muted-foreground max-w-prose">
        Decrypt an encrypted .mram file from your lodge, preview what was
        unlocked, then continue to practice.
      </p>
      <div
        className="flex items-center gap-2 text-xs text-muted-foreground"
        role="note"
      >
        <Lock
          className="size-3.5 text-amber-500"
          strokeWidth={2}
          aria-hidden="true"
        />
        <span>Decryption stays on this device.</span>
      </div>
    </div>
  );
}

function Progress({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-2 w-full rounded-full bg-muted overflow-hidden"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-amber-500 transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
