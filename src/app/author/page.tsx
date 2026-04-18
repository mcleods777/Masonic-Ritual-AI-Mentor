/**
 * /author — Ritual review & correction tool (dev-only).
 *
 * Purpose: load a {name}-dialogue.md / {name}-dialogue-cipher.md pair from
 * the local rituals/ directory, render them side-by-side line-for-line,
 * surface every structural discrepancy or suspicious word/cipher pairing,
 * and save corrections back to disk before they're encrypted into .mram.
 *
 * Safety posture: this page fetches from /api/author/* routes that refuse
 * to respond when NODE_ENV is "production" or the request isn't loopback.
 * The page itself renders a disabled banner in production so a deployed
 * build never shows this UI.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  parseDialogue,
  serializeDialogue,
  type DialogueDocument,
  type DialogueNode,
} from "@/lib/dialogue-format";
import {
  validateParsedPair,
  type PairLineIssue,
  type PairValidationResult,
} from "@/lib/author-validation";
import { buildFromDialogue } from "@/lib/dialogue-to-mram";
import { encryptMRAM } from "@/lib/mram-format";

interface PairListEntry {
  name: string;
  hasPlain: boolean;
  hasCipher: boolean;
  plainBytes: number;
  cipherBytes: number;
  plainMtime: number | null;
  cipherMtime: number | null;
}

export default function AuthorPage() {
  const [pairs, setPairs] = useState<PairListEntry[]>([]);
  const [ritualsDir, setRitualsDir] = useState<string>("");
  const [selectedName, setSelectedName] = useState<string>("");
  const [plainSource, setPlainSource] = useState<string>("");
  const [cipherSource, setCipherSource] = useState<string>("");
  const [savedPlainSource, setSavedPlainSource] = useState<string>("");
  const [savedCipherSource, setSavedCipherSource] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<"info" | "error" | "ok">("info");
  const [loading, setLoading] = useState<boolean>(true);
  const [showSource, setShowSource] = useState<boolean>(false);
  const [jumpTo, setJumpTo] = useState<number | null>(null);

  const refreshPairs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/author/list");
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`list failed: ${res.status} ${text}`);
      }
      const data = (await res.json()) as {
        ritualsDir: string;
        pairs: PairListEntry[];
      };
      setPairs(data.pairs);
      setRitualsDir(data.ritualsDir);
      setSelectedName((curr) =>
        curr || data.pairs.length === 0 ? curr : data.pairs[0].name,
      );
    } catch (err) {
      setStatus(`Failed to list pairs: ${(err as Error).message}`);
      setStatusKind("error");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPair = useCallback(async (name: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/author/pair?name=${encodeURIComponent(name)}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`load failed: ${res.status} ${text}`);
      }
      const data = (await res.json()) as {
        plainSource: string;
        cipherSource: string;
      };
      setPlainSource(data.plainSource);
      setCipherSource(data.cipherSource);
      setSavedPlainSource(data.plainSource);
      setSavedCipherSource(data.cipherSource);
      setStatus(`Loaded ${name}`);
      setStatusKind("info");
    } catch (err) {
      setStatus(`Failed to load pair: ${(err as Error).message}`);
      setStatusKind("error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPairs();
  }, [refreshPairs]);

  useEffect(() => {
    if (!selectedName) return;
    void loadPair(selectedName);
  }, [selectedName, loadPair]);

  useEffect(() => {
    if (jumpTo === null) return;
    const el = document.getElementById(`node-row-${jumpTo}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-amber-400");
      setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 1500);
    }
    setJumpTo(null);
  }, [jumpTo]);

  async function savePair() {
    if (!selectedName) return;
    setLoading(true);
    try {
      const res = await fetch("/api/author/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedName,
          plainSource,
          cipherSource,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`save failed: ${res.status} ${text}`);
      }
      setSavedPlainSource(plainSource);
      setSavedCipherSource(cipherSource);
      setStatus(`Saved ${selectedName} at ${new Date().toLocaleTimeString()}`);
      setStatusKind("ok");
      void refreshPairs();
    } catch (err) {
      setStatus(`Save failed: ${(err as Error).message}`);
      setStatusKind("error");
    } finally {
      setLoading(false);
    }
  }

  const dirty =
    plainSource !== savedPlainSource || cipherSource !== savedCipherSource;

  const parsedPlain = useMemo<DialogueDocument | null>(() => {
    if (!plainSource) return null;
    try {
      return parseDialogue(plainSource);
    } catch {
      return null;
    }
  }, [plainSource]);

  const parsedCipher = useMemo<DialogueDocument | null>(() => {
    if (!cipherSource) return null;
    try {
      return parseDialogue(cipherSource);
    } catch {
      return null;
    }
  }, [cipherSource]);

  const validation = useMemo<PairValidationResult | null>(() => {
    if (!parsedPlain || !parsedCipher) return null;
    return validateParsedPair(parsedPlain, parsedCipher);
  }, [parsedPlain, parsedCipher]);

  const issuesByIndex = useMemo(() => {
    const map = new Map<number, PairLineIssue[]>();
    if (!validation) return map;
    for (const issue of validation.lineIssues) {
      const bucket = map.get(issue.index) ?? [];
      bucket.push(issue);
      map.set(issue.index, bucket);
    }
    return map;
  }, [validation]);

  const updateLineText = useCallback(
    (index: number, side: "plain" | "cipher", nextText: string) => {
      const sourceDoc = side === "plain" ? parsedPlain : parsedCipher;
      if (!sourceDoc) return;
      const nextNodes: DialogueNode[] = sourceDoc.nodes.map((n, i) => {
        if (i !== index) return n;
        if (n.kind === "line") return { ...n, text: nextText };
        if (n.kind === "cue") return { ...n, text: nextText };
        return n;
      });
      const nextDoc: DialogueDocument = { ...sourceDoc, nodes: nextNodes };
      const serialized = serializeDialogue(nextDoc);
      if (side === "plain") setPlainSource(serialized);
      else setCipherSource(serialized);
    },
    [parsedPlain, parsedCipher],
  );

  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    return (
      <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-6 text-red-200">
        <h1 className="text-xl font-semibold mb-2">Author tool disabled</h1>
        <p className="text-sm">
          The ritual review and correction tool only runs in local development.
          It edits plaintext ritual files on disk and is never served from a
          production build.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-zinc-100">
            Ritual Author Review
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Review and correct plain/cipher pairings before they are built into
            a <code className="text-amber-300">.mram</code> file. Local only.
          </p>
          {ritualsDir && (
            <p className="text-xs text-zinc-500 mt-1 font-mono break-all">
              {ritualsDir}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Ritual pair"
            value={selectedName}
            onChange={(e) => setSelectedName(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200"
          >
            {pairs.length === 0 && <option value="">— no pairs found —</option>}
            {pairs.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
                {p.hasPlain && p.hasCipher ? "" : " (incomplete)"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              if (selectedName) void loadPair(selectedName);
              else void refreshPairs();
            }}
            className="px-3 py-2 text-sm border border-zinc-700 rounded-md text-zinc-200 hover:bg-zinc-800"
          >
            Reload
          </button>
          <button
            type="button"
            disabled={!dirty || loading}
            onClick={() => void savePair()}
            className="px-3 py-2 text-sm rounded-md bg-amber-600 text-zinc-950 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-500"
          >
            {dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </header>

      {status && (
        <div
          className={`rounded-md px-3 py-2 text-sm border ${
            statusKind === "error"
              ? "bg-red-950/30 border-red-900/50 text-red-200"
              : statusKind === "ok"
                ? "bg-emerald-950/30 border-emerald-900/50 text-emerald-200"
                : "bg-zinc-900 border-zinc-800 text-zinc-300"
          }`}
        >
          {status}
        </div>
      )}

      <ValidationSummary validation={validation} dirty={dirty} />

      <IssueList
        validation={validation}
        onJump={(i) => setJumpTo(i)}
      />

      <PairedView
        plain={parsedPlain}
        cipher={parsedCipher}
        issuesByIndex={issuesByIndex}
        onEdit={updateLineText}
      />

      <ExportPanel
        pairName={selectedName}
        plain={parsedPlain}
        cipher={parsedCipher}
        validation={validation}
        dirty={dirty}
      />

      <details
        open={showSource}
        onToggle={(e) => setShowSource((e.target as HTMLDetailsElement).open)}
        className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"
      >
        <summary className="cursor-pointer text-sm font-semibold text-zinc-300 select-none">
          Raw source (for structural edits: speakers, cues, sections, frontmatter)
        </summary>
        <div className="grid grid-cols-1 gap-3 mt-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1">
              Plain source
            </label>
            <textarea
              value={plainSource}
              onChange={(e) => setPlainSource(e.target.value)}
              spellCheck={false}
              className="w-full h-80 bg-zinc-900 border border-zinc-800 rounded-md p-3 font-mono text-xs text-zinc-200"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1">
              Cipher source
            </label>
            <textarea
              value={cipherSource}
              onChange={(e) => setCipherSource(e.target.value)}
              spellCheck={false}
              className="w-full h-80 bg-zinc-900 border border-zinc-800 rounded-md p-3 font-mono text-xs text-zinc-200"
            />
          </div>
        </div>
      </details>
    </div>
  );
}

function ValidationSummary({
  validation,
  dirty,
}: {
  validation: PairValidationResult | null;
  dirty: boolean;
}) {
  if (!validation) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-400">
        Select a ritual pair to begin. If no pairs appear, drop{" "}
        <code className="text-amber-300">name-dialogue.md</code> and{" "}
        <code className="text-amber-300">name-dialogue-cipher.md</code> into
        the <code className="text-amber-300">rituals/</code> folder.
      </div>
    );
  }

  const errors = validation.lineIssues.filter((i) => i.severity === "error").length;
  const warnings = validation.lineIssues.filter((i) => i.severity === "warning").length;
  const parseWarnings =
    validation.plainWarnings.length + validation.cipherWarnings.length;

  const ok = validation.structureOk && errors === 0 && parseWarnings === 0;

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 ${
        ok
          ? "border-emerald-900/50 bg-emerald-950/20 text-emerald-100"
          : errors > 0 || !validation.structureOk
            ? "border-red-900/50 bg-red-950/20 text-red-100"
            : "border-amber-900/50 bg-amber-950/20 text-amber-100"
      }`}
    >
      <Stat label="Structure" value={validation.structureOk ? "lockstep" : "DIVERGED"} />
      <Stat
        label="Lines"
        value={`${validation.counts.spokenLines} spoken / ${validation.counts.actionLines} action / ${validation.counts.cues} cues`}
      />
      <Stat label="Sections" value={String(validation.counts.sections)} />
      <Stat
        label="Issues"
        value={`${errors} err / ${warnings} warn${parseWarnings ? ` / ${parseWarnings} parse` : ""}`}
      />
      {dirty && (
        <div className="col-span-full text-xs opacity-80">
          Unsaved changes in memory. Save to write back to disk.
        </div>
      )}
      {!validation.structureOk && validation.firstDivergence && (
        <div className="col-span-full text-xs opacity-90 font-mono">
          First divergence @ node {validation.firstDivergence.index}: plain=
          {validation.firstDivergence.plain} cipher=
          {validation.firstDivergence.cipher}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider opacity-70">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function IssueList({
  validation,
  onJump,
}: {
  validation: PairValidationResult | null;
  onJump: (index: number) => void;
}) {
  if (!validation) return null;
  const { lineIssues, plainWarnings, cipherWarnings } = validation;
  if (
    lineIssues.length === 0 &&
    plainWarnings.length === 0 &&
    cipherWarnings.length === 0
  ) {
    return null;
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <h2 className="text-sm font-semibold text-zinc-200 mb-3">
        Issues ({lineIssues.length + plainWarnings.length + cipherWarnings.length})
      </h2>
      <ul className="space-y-1 text-sm max-h-64 overflow-y-auto pr-2">
        {plainWarnings.map((w, i) => (
          <li
            key={`pw-${i}`}
            className="px-2 py-1 rounded bg-red-950/20 border border-red-900/40 text-red-200"
          >
            <span className="font-mono text-xs mr-2">plain:L{w.lineNo}</span>
            {w.reason}: <span className="font-mono">{w.line}</span>
          </li>
        ))}
        {cipherWarnings.map((w, i) => (
          <li
            key={`cw-${i}`}
            className="px-2 py-1 rounded bg-red-950/20 border border-red-900/40 text-red-200"
          >
            <span className="font-mono text-xs mr-2">cipher:L{w.lineNo}</span>
            {w.reason}: <span className="font-mono">{w.line}</span>
          </li>
        ))}
        {lineIssues.map((issue, i) => (
          <li key={`li-${i}`}>
            <button
              type="button"
              onClick={() => onJump(issue.index)}
              className={`w-full text-left px-2 py-1 rounded border ${
                issue.severity === "error"
                  ? "bg-red-950/20 border-red-900/40 text-red-200 hover:bg-red-950/40"
                  : "bg-amber-950/20 border-amber-900/40 text-amber-200 hover:bg-amber-950/40"
              }`}
            >
              <span className="font-mono text-xs mr-2">#{issue.index}</span>
              <span className="text-xs uppercase mr-2 opacity-70">
                {issue.kind}
              </span>
              {issue.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PairedView({
  plain,
  cipher,
  issuesByIndex,
  onEdit,
}: {
  plain: DialogueDocument | null;
  cipher: DialogueDocument | null;
  issuesByIndex: Map<number, PairLineIssue[]>;
  onEdit: (index: number, side: "plain" | "cipher", text: string) => void;
}) {
  if (!plain || !cipher) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-950 px-4 py-8 text-center text-sm text-zinc-500">
        Load a ritual pair to view lines side-by-side.
      </div>
    );
  }

  const rows: React.ReactNode[] = [];
  const max = Math.max(plain.nodes.length, cipher.nodes.length);

  for (let i = 0; i < max; i++) {
    const p = plain.nodes[i];
    const c = cipher.nodes[i];
    const issues = issuesByIndex.get(i) ?? [];
    const hasError = issues.some((x) => x.severity === "error");
    const hasWarn = issues.some((x) => x.severity === "warning");

    const borderCls = hasError
      ? "border-red-700"
      : hasWarn
        ? "border-amber-700"
        : "border-zinc-700";
    const bgCls = hasError
      ? "bg-red-950/30"
      : hasWarn
        ? "bg-amber-950/30"
        : "bg-zinc-900";

    if (!p || !c) {
      rows.push(
        <div
          id={`node-row-${i}`}
          key={i}
          className={`rounded-md border ${borderCls} ${bgCls} px-3 py-2 text-xs text-red-200`}
        >
          Missing node on {!p ? "plain" : "cipher"} side at index {i}.
        </div>,
      );
      continue;
    }

    if (p.kind === "section" && c.kind === "section") {
      rows.push(
        <div
          id={`node-row-${i}`}
          key={i}
          className={`rounded-md border ${borderCls} bg-zinc-800 px-3 py-2`}
        >
          <div className="text-xs uppercase tracking-wider text-zinc-400">
            Section
          </div>
          <div className="font-semibold text-zinc-100">{p.title}</div>
          {p.title !== c.title && (
            <div className="text-xs text-red-300 mt-1">
              Cipher section title differs: “{c.title}”
            </div>
          )}
        </div>,
      );
      continue;
    }

    if (p.kind === "cue" && c.kind === "cue") {
      rows.push(
        <div
          id={`node-row-${i}`}
          key={i}
          className={`rounded-md border ${borderCls} ${bgCls} px-3 py-2 grid grid-cols-1 gap-2`}
        >
          <CueField
            label="Plain cue"
            value={p.text}
            onChange={(t) => onEdit(i, "plain", t)}
          />
          <CueField
            label="Cipher cue"
            value={c.text}
            onChange={(t) => onEdit(i, "cipher", t)}
          />
          <IssuesInline issues={issues} />
        </div>,
      );
      continue;
    }

    if (p.kind === "line" && c.kind === "line") {
      rows.push(
        <div
          id={`node-row-${i}`}
          key={i}
          className={`rounded-md border ${borderCls} ${bgCls} px-3 py-2`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center rounded bg-zinc-800 text-zinc-300 font-mono text-xs px-2 py-0.5">
              #{i}
            </span>
            <span className="font-semibold text-amber-300">{p.speaker}</span>
            {p.speaker !== c.speaker && (
              <span className="text-red-300 text-xs font-mono">
                ≠ {c.speaker}
              </span>
            )}
            {p.isAction && (
              <span className="text-xs uppercase tracking-wider text-zinc-500">
                action
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2">
            <TextField
              label={p.isAction ? "Plain action" : "Plain"}
              value={p.text}
              onChange={(t) => onEdit(i, "plain", t)}
            />
            <TextField
              label={p.isAction ? "Cipher action" : "Cipher"}
              value={c.text}
              onChange={(t) => onEdit(i, "cipher", t)}
            />
          </div>
          <IssuesInline issues={issues} />
        </div>,
      );
      continue;
    }

    rows.push(
      <div
        id={`node-row-${i}`}
        key={i}
        className="rounded-md border border-red-900/60 bg-red-950/10 px-3 py-2 text-xs text-red-200"
      >
        Kind mismatch at index {i}: plain={p.kind} cipher={c.kind}. Fix in
        raw source below.
      </div>,
    );
  }

  return <div className="space-y-2">{rows}</div>;
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1 font-semibold">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.max(1, Math.min(6, Math.ceil(value.length / 80)))}
        spellCheck={false}
        className="w-full bg-zinc-950 border border-zinc-600 rounded-md px-2 py-1.5 text-sm text-zinc-100 font-serif leading-relaxed focus:border-amber-500 focus:outline-none"
      />
    </div>
  );
}

function CueField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1 font-semibold">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="w-full bg-zinc-950 border border-zinc-600 rounded-md px-2 py-1.5 text-sm text-zinc-100 font-mono focus:border-amber-500 focus:outline-none"
      />
    </div>
  );
}

function IssuesInline({ issues }: { issues: PairLineIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-2 space-y-0.5">
      {issues.map((issue, i) => (
        <li
          key={i}
          className={`text-xs ${
            issue.severity === "error" ? "text-red-300" : "text-amber-300"
          }`}
        >
          <span className="font-mono uppercase mr-1">{issue.severity}</span>
          <span className="font-mono mr-1">[{issue.kind}]</span>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

/**
 * Encrypt + download the current pair as a .mram file. Everything runs in
 * the browser via Web Crypto — the passphrase never crosses the network.
 * Refuses to export if validation has any errors or the pair has unsaved
 * structural problems; a ritual file must be perfect before it ships.
 */
function ExportPanel({
  pairName,
  plain,
  cipher,
  validation,
  dirty,
}: {
  pairName: string;
  plain: DialogueDocument | null;
  cipher: DialogueDocument | null;
  validation: PairValidationResult | null;
  dirty: boolean;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<"info" | "error" | "ok">("info");

  const metadata = plain?.metadata;
  const missingMetaFields: string[] = [];
  if (plain) {
    if (!metadata?.jurisdiction) missingMetaFields.push("jurisdiction");
    if (!metadata?.degree) missingMetaFields.push("degree");
    if (!metadata?.ceremony) missingMetaFields.push("ceremony");
  }

  const errors = validation?.lineIssues.filter((i) => i.severity === "error").length ?? 0;
  const parseErrors =
    (validation?.plainWarnings.length ?? 0) + (validation?.cipherWarnings.length ?? 0);

  const passphrasesMatch =
    passphrase.length > 0 && passphrase === confirmPassphrase;

  const canEncrypt =
    !!plain &&
    !!cipher &&
    !!validation &&
    validation.structureOk &&
    errors === 0 &&
    parseErrors === 0 &&
    missingMetaFields.length === 0 &&
    passphrasesMatch &&
    !busy;

  const blockers: string[] = [];
  if (!plain || !cipher) blockers.push("no ritual pair loaded");
  if (validation && !validation.structureOk) blockers.push("plain/cipher structure diverged");
  if (errors > 0) blockers.push(`${errors} validation error(s) must be fixed`);
  if (parseErrors > 0) blockers.push(`${parseErrors} unparseable line(s) in source`);
  if (missingMetaFields.length > 0)
    blockers.push(`plain frontmatter missing: ${missingMetaFields.join(", ")}`);
  if (dirty)
    blockers.push(
      "unsaved edits — save to disk first so the encrypted file matches your source of truth",
    );
  if (passphrase.length === 0) blockers.push("passphrase required");
  else if (!passphrasesMatch) blockers.push("passphrases do not match");

  async function handleEncrypt() {
    if (!plain || !cipher || !metadata) return;
    setBusy(true);
    setStatus("");
    try {
      const { doc } = await buildFromDialogue(plain, cipher, {
        jurisdiction: metadata.jurisdiction!,
        degree: metadata.degree!,
        ceremony: metadata.ceremony!,
      });
      const buf = await encryptMRAM(doc, passphrase);
      const name = pairName || "ritual";
      const res = await fetch(
        `/api/author/mram?name=${encodeURIComponent(name)}`,
        {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: buf,
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const saved = (await res.json()) as { path: string; bytes: number };
      setStatus(
        `Encrypted ${doc.lines.length} lines across ${doc.sections.length} sections. Saved ${saved.bytes} bytes to ${saved.path}.`,
      );
      setStatusKind("ok");
      setPassphrase("");
      setConfirmPassphrase("");
    } catch (err) {
      setStatus(`Encryption failed: ${(err as Error).message}`);
      setStatusKind("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">
          Encrypt &amp; save <code className="text-amber-300">.mram</code> to
          rituals/
        </h2>
        <div className="text-xs text-zinc-500">
          Passphrase stays in this browser — never sent to any server.
        </div>
      </div>

      {metadata && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <MetaField label="Jurisdiction" value={metadata.jurisdiction} />
          <MetaField label="Degree" value={metadata.degree} />
          <MetaField label="Ceremony" value={metadata.ceremony} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1">
            Passphrase
          </label>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1.5 text-sm text-zinc-200 font-mono"
            placeholder="required"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1">
            Confirm passphrase
          </label>
          <input
            type="password"
            value={confirmPassphrase}
            onChange={(e) => setConfirmPassphrase(e.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1.5 text-sm text-zinc-200 font-mono"
            placeholder="must match"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canEncrypt}
          onClick={() => void handleEncrypt()}
          className="px-3 py-2 text-sm rounded-md bg-amber-600 text-zinc-950 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-500"
        >
          {busy ? "Encrypting…" : "Encrypt & Save to rituals/"}
        </button>
        {blockers.length > 0 && (
          <ul className="text-xs text-amber-300 list-disc list-inside">
            {blockers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}
      </div>

      {status && (
        <div
          className={`rounded-md px-3 py-2 text-xs border ${
            statusKind === "error"
              ? "bg-red-950/30 border-red-900/50 text-red-200"
              : statusKind === "ok"
                ? "bg-emerald-950/30 border-emerald-900/50 text-emerald-200"
                : "bg-zinc-900 border-zinc-800 text-zinc-300"
          }`}
        >
          {status}
        </div>
      )}
    </div>
  );
}

function MetaField({ label, value }: { label: string; value?: string }) {
  const missing = !value;
  return (
    <div
      className={`rounded-md border px-2 py-1.5 ${
        missing
          ? "border-red-900/50 bg-red-950/20 text-red-200"
          : "border-zinc-800 bg-zinc-900 text-zinc-200"
      }`}
    >
      <div className="uppercase tracking-wider text-[10px] opacity-70">{label}</div>
      <div className="font-semibold truncate">{value || "(missing)"}</div>
    </div>
  );
}
