"use client";

import type { ComparisonResult } from "@/lib/text-comparison";

interface DiffDisplayProps {
  result: ComparisonResult;
}

function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 95) return "text-green-400";
  if (accuracy >= 85) return "text-emerald-400";
  if (accuracy >= 70) return "text-amber-400";
  if (accuracy >= 50) return "text-orange-400";
  return "text-red-400";
}

function getAccuracyLabel(accuracy: number): string {
  if (accuracy >= 95) return "Excellent";
  if (accuracy >= 85) return "Very Good";
  if (accuracy >= 70) return "Good Progress";
  if (accuracy >= 50) return "Keep Practicing";
  return "Getting Started";
}

export default function DiffDisplay({ result }: DiffDisplayProps) {
  return (
    <div className="space-y-4">
      {/* Score Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-zinc-800 rounded-lg p-3 text-center">
          <p className={`text-2xl font-bold ${getAccuracyColor(result.accuracy)}`}>
            {result.accuracy}%
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {getAccuracyLabel(result.accuracy)}
          </p>
        </div>
        <div className="bg-zinc-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-400">
            {result.correctWords}
          </p>
          <p className="text-xs text-zinc-500 mt-1">Correct Words</p>
        </div>
        <div className="bg-zinc-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-red-400">{result.wrongWords}</p>
          <p className="text-xs text-zinc-500 mt-1">Wrong Words</p>
        </div>
        <div className="bg-zinc-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-yellow-400">
            {result.missingWords}
          </p>
          <p className="text-xs text-zinc-500 mt-1">Missing Words</p>
        </div>
      </div>

      {/* Phonetic/Fuzzy matches info */}
      {(result.phoneticMatches > 0 || result.fuzzyMatches > 0) && (
        <p className="text-xs text-zinc-500">
          {result.phoneticMatches > 0 && (
            <span className="text-blue-400">
              {result.phoneticMatches} word{result.phoneticMatches !== 1 ? "s" : ""} forgiven
              (speech recognition artifact){" "}
            </span>
          )}
          {result.fuzzyMatches > 0 && (
            <span className="text-purple-400">
              {result.fuzzyMatches} word{result.fuzzyMatches !== 1 ? "s" : ""} close enough
              (minor transcription difference)
            </span>
          )}
        </p>
      )}

      {/* Word-by-word diff */}
      <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
        <p className="text-xs text-zinc-500 mb-3">
          <span className="inline-block w-3 h-3 rounded bg-green-500/30 mr-1 align-middle" />{" "}
          Correct{" "}
          <span className="inline-block w-3 h-3 rounded bg-red-500/30 ml-3 mr-1 align-middle" />{" "}
          Wrong{" "}
          <span className="inline-block w-3 h-3 rounded bg-yellow-500/30 ml-3 mr-1 align-middle" />{" "}
          Missing{" "}
          <span className="inline-block w-3 h-3 rounded bg-blue-500/30 ml-3 mr-1 align-middle" />{" "}
          Phonetic Match{" "}
          <span className="inline-block w-3 h-3 rounded bg-zinc-500/30 ml-3 mr-1 align-middle" />{" "}
          Extra
        </p>

        <div className="flex flex-wrap gap-1 leading-relaxed">
          {result.diffs.map((diff, index) => {
            let className = "";
            let title = "";

            switch (diff.type) {
              case "correct":
                className =
                  "text-green-300 bg-green-500/10 px-1 rounded";
                break;
              case "wrong":
                className =
                  "text-red-300 bg-red-500/20 px-1 rounded line-through decoration-red-500";
                title = `Expected: "${diff.expected}"`;
                break;
              case "missing":
                className =
                  "text-yellow-300 bg-yellow-500/20 px-1 rounded border-b-2 border-yellow-500 border-dashed";
                title = "Missing word";
                break;
              case "extra":
                className =
                  "text-zinc-500 bg-zinc-500/10 px-1 rounded italic";
                title = "Extra word (not in reference)";
                break;
              case "phonetic_match":
                className =
                  "text-blue-300 bg-blue-500/10 px-1 rounded";
                title = `Phonetically matched (transcribed differently)`;
                break;
              case "fuzzy_match":
                className =
                  "text-purple-300 bg-purple-500/10 px-1 rounded";
                title = `Close match (minor difference)`;
                break;
            }

            return (
              <span key={index} className={className} title={title}>
                {diff.word}
                {diff.type === "wrong" && diff.expected && (
                  <span className="text-green-400 no-underline ml-1">
                    [{diff.expected}]
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>

      {/* Trouble Spots */}
      {result.troubleSpots.length > 0 && (
        <div className="p-4 bg-amber-900/20 rounded-lg border border-amber-800/50">
          <h4 className="text-sm font-medium text-amber-400 mb-2">
            Focus on these words:
          </h4>
          <div className="flex flex-wrap gap-2">
            {result.troubleSpots.map((word, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-full text-sm"
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
