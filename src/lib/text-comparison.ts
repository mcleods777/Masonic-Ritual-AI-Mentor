/**
 * Five-layer text comparison pipeline for ritual recitation checking.
 *
 * Layer 1: Normalization (lowercase, expand contractions, strip fillers)
 * Layer 2: Word-level diff (jsdiff)
 * Layer 3: Phonetic forgiveness (Double Metaphone)
 * Layer 4: Fuzzy tolerance (Levenshtein distance)
 * Layer 5: Scoring and display
 */

import { diffWords, type Change } from "diff";

// ============================================================
// Layer 1: Normalization
// ============================================================

const FILLER_WORDS = new Set(["um", "uh", "er", "ah", "like", "you know", "hmm"]);

const CONTRACTIONS: Record<string, string> = {
  "can't": "cannot",
  "won't": "will not",
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "hasn't": "has not",
  "haven't": "have not",
  "hadn't": "had not",
  "wouldn't": "would not",
  "shouldn't": "should not",
  "couldn't": "could not",
  "i'm": "i am",
  "you're": "you are",
  "we're": "we are",
  "they're": "they are",
  "he's": "he is",
  "she's": "she is",
  "it's": "it is",
  "that's": "that is",
  "who's": "who is",
  "what's": "what is",
  "there's": "there is",
  "here's": "here is",
  "i've": "i have",
  "you've": "you have",
  "we've": "we have",
  "they've": "they have",
  "i'll": "i will",
  "you'll": "you will",
  "we'll": "we will",
  "they'll": "they will",
  "i'd": "i would",
  "you'd": "you would",
  "we'd": "we would",
  "they'd": "they would",
};

// Common STT misrecognitions for Masonic terms
const MASONIC_ALIASES: Record<string, string> = {
  tiler: "tyler",
  mote: "mote", // "so mote it be"
  moat: "mote",
  right: "rite",
  rights: "rites",
  mason: "mason",
  masons: "masons",
  worshipful: "worshipful",
  decon: "deacon",
  warden: "warden",
  alter: "altar",
  plum: "plumb",
  compasses: "compasses",
  compass: "compasses",
  profane: "profane",
};

export function normalize(text: string): string {
  let result = text
    .toLowerCase()
    // Normalize smart quotes and dashes
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    // Remove punctuation (except apostrophes in contractions)
    .replace(/[.,;:!?()[\]{}"—–\-]/g, " ")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim();

  // Expand contractions
  for (const [contraction, expansion] of Object.entries(CONTRACTIONS)) {
    result = result.replace(new RegExp(`\\b${contraction.replace("'", "'")}\\b`, "gi"), expansion);
  }

  // Remove filler words
  const words = result.split(/\s+/).filter((w) => !FILLER_WORDS.has(w));

  return words.join(" ");
}

// ============================================================
// Layer 2: Word-level diff
// ============================================================

export interface WordDiff {
  word: string;
  type: "correct" | "wrong" | "missing" | "extra" | "phonetic_match" | "fuzzy_match";
  expected?: string;
}

// ============================================================
// Layer 3: Phonetic forgiveness (Double Metaphone)
// ============================================================

/**
 * Simple Double Metaphone implementation for phonetic comparison.
 * Returns primary and secondary phonetic codes.
 */
function simpleMetaphone(word: string): string {
  // Simplified metaphone - convert word to phonetic representation
  return word
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/([a-z])\1+/g, "$1") // remove doubled letters
    .replace(/^(kn|gn|pn|ae|wr)/, (m) => m[1]) // silent first letters
    .replace(/mb$/, "m") // silent b
    .replace(/ght/g, "t")
    .replace(/ph/g, "f")
    .replace(/th/g, "0")
    .replace(/sh/g, "x")
    .replace(/ch/g, "x")
    .replace(/ck/g, "k")
    .replace(/wh/g, "w")
    .replace(/[aeiou]/g, "") // remove vowels (except leading)
    .slice(0, 6);
}

function phoneticallyEqual(word1: string, word2: string): boolean {
  if (word1 === word2) return true;

  // Check Masonic alias map first
  const alias1 = MASONIC_ALIASES[word1] || word1;
  const alias2 = MASONIC_ALIASES[word2] || word2;
  if (alias1 === alias2) return true;

  // Compare phonetic codes
  const code1 = simpleMetaphone(word1);
  const code2 = simpleMetaphone(word2);

  return code1.length > 0 && code1 === code2;
}

// ============================================================
// Layer 4: Fuzzy tolerance (Levenshtein)
// ============================================================

function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        s1[i - 1] === s2[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

function fuzzyMatch(word1: string, word2: string, maxDistance: number = 2): boolean {
  if (Math.abs(word1.length - word2.length) > maxDistance) return false;
  return levenshteinDistance(word1, word2) <= maxDistance;
}

// ============================================================
// Layer 5: Scoring and full comparison
// ============================================================

export interface ComparisonResult {
  diffs: WordDiff[];
  accuracy: number;
  totalWords: number;
  correctWords: number;
  phoneticMatches: number;
  fuzzyMatches: number;
  wrongWords: number;
  missingWords: number;
  extraWords: number;
  troubleSpots: string[];
}

/**
 * Compare spoken text against reference text using the full 5-layer pipeline.
 */
export function compareTexts(
  spokenText: string,
  referenceText: string
): ComparisonResult {
  const normalizedSpoken = normalize(spokenText);
  const normalizedRef = normalize(referenceText);

  // Layer 2: Word-level diff
  const changes: Change[] = diffWords(normalizedSpoken, normalizedRef, {
    ignoreCase: true,
  });

  const diffs: WordDiff[] = [];
  let correctWords = 0;
  let phoneticMatches = 0;
  let fuzzyMatches = 0;
  let wrongWords = 0;
  let missingWords = 0;
  let extraWords = 0;
  const troubleSpots: string[] = [];

  // Process diff changes
  let i = 0;
  while (i < changes.length) {
    const change = changes[i];

    if (!change.added && !change.removed) {
      // Matched text
      const words = change.value.trim().split(/\s+/).filter(Boolean);
      for (const word of words) {
        diffs.push({ word, type: "correct" });
        correctWords++;
      }
      i++;
    } else if (change.removed && i + 1 < changes.length && changes[i + 1].added) {
      // Substitution: spoken word differs from reference
      const spokenWords = change.value.trim().split(/\s+/).filter(Boolean);
      const refWords = changes[i + 1].value.trim().split(/\s+/).filter(Boolean);

      const maxLen = Math.max(spokenWords.length, refWords.length);
      for (let j = 0; j < maxLen; j++) {
        const sw = spokenWords[j];
        const rw = refWords[j];

        if (!sw && rw) {
          diffs.push({ word: rw, type: "missing" });
          missingWords++;
          troubleSpots.push(rw);
        } else if (sw && !rw) {
          diffs.push({ word: sw, type: "extra" });
          extraWords++;
        } else if (sw && rw) {
          // Layer 3: Phonetic check
          if (phoneticallyEqual(sw, rw)) {
            diffs.push({ word: rw, type: "phonetic_match", expected: rw });
            phoneticMatches++;
            correctWords++;
          }
          // Layer 4: Fuzzy check
          else if (fuzzyMatch(sw, rw)) {
            diffs.push({ word: rw, type: "fuzzy_match", expected: rw });
            fuzzyMatches++;
            correctWords++;
          } else {
            diffs.push({ word: sw, type: "wrong", expected: rw });
            wrongWords++;
            troubleSpots.push(rw);
          }
        }
      }
      i += 2;
    } else if (change.added) {
      // Words in reference but not spoken (missing)
      const words = change.value.trim().split(/\s+/).filter(Boolean);
      for (const word of words) {
        diffs.push({ word, type: "missing" });
        missingWords++;
        troubleSpots.push(word);
      }
      i++;
    } else if (change.removed) {
      // Words spoken but not in reference (extra)
      const words = change.value.trim().split(/\s+/).filter(Boolean);
      for (const word of words) {
        diffs.push({ word, type: "extra" });
        extraWords++;
      }
      i++;
    } else {
      i++;
    }
  }

  const totalRefWords = normalizedRef.split(/\s+/).filter(Boolean).length;
  const accuracy = totalRefWords > 0 ? (correctWords / totalRefWords) * 100 : 0;

  return {
    diffs,
    accuracy: Math.round(accuracy * 10) / 10,
    totalWords: totalRefWords,
    correctWords,
    phoneticMatches,
    fuzzyMatches,
    wrongWords,
    missingWords,
    extraWords,
    troubleSpots: [...new Set(troubleSpots)].slice(0, 10),
  };
}
