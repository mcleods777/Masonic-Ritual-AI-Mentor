/**
 * Performance History — Persistent tracking of practice sessions over time.
 *
 * Stores session results in IndexedDB (unencrypted — no ritual text is stored,
 * only numeric scores, timestamps, section names, and trouble-spot words).
 *
 * Schema:
 *   sessions   — one record per practice/rehearsal session
 *   lineScores — individual line scores within a session
 */

const DB_NAME = "masonic-performance";
const DB_VERSION = 1;
const SESSIONS_STORE = "sessions";
const LINE_SCORES_STORE = "lineScores";

// ============================================================
// Types
// ============================================================

export interface PracticeSession {
  id: string;
  documentId: string;
  documentTitle: string;
  mode: "solo" | "rehearsal";
  role: string | null;          // Officer role (rehearsal mode)
  degree: string;
  sectionName: string | null;   // Solo mode section; null for full rehearsal
  overallAccuracy: number;      // 0-100
  linesAttempted: number;
  linesNailed: number;          // accuracy >= 90
  troubleSpots: string[];       // Most-missed words (top 10)
  startedAt: string;            // ISO timestamp
  duration: number;             // Seconds
}

export interface LineScore {
  id: string;
  sessionId: string;
  sectionName: string;
  lineIndex: number;
  accuracy: number;
  wrongWords: number;
  missingWords: number;
  troubleSpots: string[];
  timestamp: string;
}

/** Aggregated stats for a section across all sessions */
export interface SectionStats {
  sectionName: string;
  degree: string;
  attempts: number;
  bestAccuracy: number;
  averageAccuracy: number;
  lastAccuracy: number;
  lastPracticed: string;
  persistentTroubleSpots: string[];  // Words missed in >= 50% of attempts
}

/** Overall summary across all sessions */
export interface PerformanceSummary {
  totalSessions: number;
  totalLinesAttempted: number;
  averageAccuracy: number;
  bestAccuracy: number;
  currentStreak: number;        // Consecutive sessions with avg >= 80%
  longestStreak: number;
  recentTrend: "improving" | "steady" | "declining";
  weakestSections: SectionStats[];
  strongestSections: SectionStats[];
  persistentTroubleSpots: string[];
  lastSessionDate: string | null;
}

// ============================================================
// IndexedDB helpers
// ============================================================

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        const store = db.createObjectStore(SESSIONS_STORE, { keyPath: "id" });
        store.createIndex("documentId", "documentId", { unique: false });
        store.createIndex("startedAt", "startedAt", { unique: false });
        store.createIndex("degree", "degree", { unique: false });
      }

      if (!db.objectStoreNames.contains(LINE_SCORES_STORE)) {
        const store = db.createObjectStore(LINE_SCORES_STORE, { keyPath: "id" });
        store.createIndex("sessionId", "sessionId", { unique: false });
        store.createIndex("sectionName", "sectionName", { unique: false });
      }
    };
  });
}

// ============================================================
// Write API
// ============================================================

export async function saveSession(session: PracticeSession, lineScores: LineScore[]): Promise<void> {
  const db = await openDB();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, "readwrite");
    const store = tx.objectStore(SESSIONS_STORE);
    const request = store.put(session);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });

  for (const score of lineScores) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LINE_SCORES_STORE, "readwrite");
      const store = tx.objectStore(LINE_SCORES_STORE);
      const request = store.put(score);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  db.close();
}

// ============================================================
// Read API
// ============================================================

export async function getAllSessions(): Promise<PracticeSession[]> {
  const db = await openDB();
  const sessions = await new Promise<PracticeSession[]>((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, "readonly");
    const store = tx.objectStore(SESSIONS_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as PracticeSession[]);
  });
  db.close();
  return sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export async function getSessionsByDocument(documentId: string): Promise<PracticeSession[]> {
  const db = await openDB();
  const sessions = await new Promise<PracticeSession[]>((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, "readonly");
    const store = tx.objectStore(SESSIONS_STORE);
    const index = store.index("documentId");
    const request = index.getAll(documentId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as PracticeSession[]);
  });
  db.close();
  return sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export async function getLineScoresForSession(sessionId: string): Promise<LineScore[]> {
  const db = await openDB();
  const scores = await new Promise<LineScore[]>((resolve, reject) => {
    const tx = db.transaction(LINE_SCORES_STORE, "readonly");
    const store = tx.objectStore(LINE_SCORES_STORE);
    const index = store.index("sessionId");
    const request = index.getAll(sessionId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as LineScore[]);
  });
  db.close();
  return scores.sort((a, b) => a.lineIndex - b.lineIndex);
}

// ============================================================
// Analytics
// ============================================================

export async function getSectionStats(): Promise<SectionStats[]> {
  const sessions = await getAllSessions();
  const db = await openDB();
  const allLineScores = await new Promise<LineScore[]>((resolve, reject) => {
    const tx = db.transaction(LINE_SCORES_STORE, "readonly");
    const store = tx.objectStore(LINE_SCORES_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as LineScore[]);
  });
  db.close();

  // Group line scores by section
  const sectionMap = new Map<string, { scores: LineScore[]; degree: string }>();

  for (const score of allLineScores) {
    const session = sessions.find((s) => s.id === score.sessionId);
    if (!session) continue;

    const existing = sectionMap.get(score.sectionName);
    if (existing) {
      existing.scores.push(score);
    } else {
      sectionMap.set(score.sectionName, {
        scores: [score],
        degree: session.degree,
      });
    }
  }

  const stats: SectionStats[] = [];
  for (const [sectionName, { scores, degree }] of sectionMap) {
    const accuracies = scores.map((s) => s.accuracy);
    const sorted = [...scores].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Find persistent trouble spots (words missed in >= 50% of attempts)
    const troubleWordCounts = new Map<string, number>();
    for (const score of scores) {
      for (const word of score.troubleSpots) {
        troubleWordCounts.set(word, (troubleWordCounts.get(word) || 0) + 1);
      }
    }
    const threshold = Math.max(1, Math.floor(scores.length * 0.5));
    const persistentTroubleSpots = [...troubleWordCounts.entries()]
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word)
      .slice(0, 10);

    stats.push({
      sectionName,
      degree,
      attempts: scores.length,
      bestAccuracy: Math.max(...accuracies),
      averageAccuracy: Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length),
      lastAccuracy: sorted[0]?.accuracy ?? 0,
      lastPracticed: sorted[0]?.timestamp ?? "",
      persistentTroubleSpots,
    });
  }

  return stats.sort((a, b) => a.averageAccuracy - b.averageAccuracy);
}

export async function getPerformanceSummary(): Promise<PerformanceSummary> {
  const sessions = await getAllSessions();

  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      totalLinesAttempted: 0,
      averageAccuracy: 0,
      bestAccuracy: 0,
      currentStreak: 0,
      longestStreak: 0,
      recentTrend: "steady",
      weakestSections: [],
      strongestSections: [],
      persistentTroubleSpots: [],
      lastSessionDate: null,
    };
  }

  const totalLines = sessions.reduce((acc, s) => acc + s.linesAttempted, 0);
  const accuracies = sessions.map((s) => s.overallAccuracy);
  const avgAccuracy = Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length);
  const bestAccuracy = Math.max(...accuracies);

  // Streak calculation (consecutive sessions with >= 80% accuracy, newest first)
  let currentStreak = 0;
  for (const session of sessions) {
    if (session.overallAccuracy >= 80) currentStreak++;
    else break;
  }

  let longestStreak = 0;
  let streak = 0;
  for (const session of sessions) {
    if (session.overallAccuracy >= 80) {
      streak++;
      longestStreak = Math.max(longestStreak, streak);
    } else {
      streak = 0;
    }
  }

  // Recent trend: compare last 3 sessions avg vs previous 3
  let recentTrend: "improving" | "steady" | "declining" = "steady";
  if (sessions.length >= 4) {
    const recent3 = sessions.slice(0, 3).map((s) => s.overallAccuracy);
    const prev3 = sessions.slice(3, 6).map((s) => s.overallAccuracy);
    const recentAvg = recent3.reduce((a, b) => a + b, 0) / recent3.length;
    const prevAvg = prev3.reduce((a, b) => a + b, 0) / prev3.length;
    if (recentAvg - prevAvg > 5) recentTrend = "improving";
    else if (prevAvg - recentAvg > 5) recentTrend = "declining";
  }

  // Persistent trouble spots across all sessions
  const troubleWordCounts = new Map<string, number>();
  for (const session of sessions) {
    for (const word of session.troubleSpots) {
      troubleWordCounts.set(word, (troubleWordCounts.get(word) || 0) + 1);
    }
  }
  const persistentTroubleSpots = [...troubleWordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);

  const sectionStats = await getSectionStats();

  return {
    totalSessions: sessions.length,
    totalLinesAttempted: totalLines,
    averageAccuracy: avgAccuracy,
    bestAccuracy,
    currentStreak,
    longestStreak,
    recentTrend,
    weakestSections: sectionStats.slice(0, 3),
    strongestSections: sectionStats.slice(-3).reverse(),
    persistentTroubleSpots,
    lastSessionDate: sessions[0]?.startedAt ?? null,
  };
}

/**
 * Build a concise performance context string for the AI coach.
 * This gets injected into the system prompt so the AI can give
 * intelligent, personalized feedback.
 */
export async function buildPerformanceContext(): Promise<string> {
  const summary = await getPerformanceSummary();
  if (summary.totalSessions === 0) {
    return "This is a new student with no practice history yet.";
  }

  const lines: string[] = [
    `STUDENT PERFORMANCE HISTORY (${summary.totalSessions} sessions):`,
    `- Overall average accuracy: ${summary.averageAccuracy}%`,
    `- Best session: ${summary.bestAccuracy}%`,
    `- Total lines practiced: ${summary.totalLinesAttempted}`,
    `- Current streak (sessions ≥80%): ${summary.currentStreak}`,
    `- Longest streak: ${summary.longestStreak}`,
    `- Recent trend: ${summary.recentTrend}`,
  ];

  if (summary.persistentTroubleSpots.length > 0) {
    lines.push(`- Persistent trouble words: ${summary.persistentTroubleSpots.join(", ")}`);
  }

  if (summary.weakestSections.length > 0) {
    lines.push("- Weakest sections:");
    for (const s of summary.weakestSections) {
      lines.push(`  * ${s.sectionName} (${s.degree}): avg ${s.averageAccuracy}%, ${s.attempts} attempts`);
      if (s.persistentTroubleSpots.length > 0) {
        lines.push(`    Trouble spots: ${s.persistentTroubleSpots.join(", ")}`);
      }
    }
  }

  if (summary.strongestSections.length > 0) {
    lines.push("- Strongest sections:");
    for (const s of summary.strongestSections) {
      lines.push(`  * ${s.sectionName} (${s.degree}): avg ${s.averageAccuracy}%`);
    }
  }

  if (summary.lastSessionDate) {
    const last = new Date(summary.lastSessionDate);
    const daysAgo = Math.floor((Date.now() - last.getTime()) / 86400000);
    lines.push(`- Last practiced: ${daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`}`);
  }

  return lines.join("\n");
}

/**
 * Generate smart topic suggestions based on performance data.
 */
export async function getSmartSuggestions(): Promise<string[]> {
  const summary = await getPerformanceSummary();
  const suggestions: string[] = [];

  if (summary.totalSessions === 0) {
    return [
      "Quiz me on the Entered Apprentice obligation",
      "What does the Senior Warden say during opening?",
      "Give me a hint for the Fellow Craft lecture",
      "Explain the significance of the working tools",
    ];
  }

  // Suggestions based on weak sections
  for (const section of summary.weakestSections.slice(0, 2)) {
    suggestions.push(
      `Help me drill the ${section.sectionName} — I'm averaging ${section.averageAccuracy}% there`
    );
  }

  // Suggestions based on trouble spots
  if (summary.persistentTroubleSpots.length > 0) {
    const words = summary.persistentTroubleSpots.slice(0, 5).join(", ");
    suggestions.push(
      `I keep stumbling on these words: ${words}. Can you help me with the passages they appear in?`
    );
  }

  // Trend-based suggestion
  if (summary.recentTrend === "improving") {
    suggestions.push("I've been improving — quiz me on something harder to keep the momentum");
  } else if (summary.recentTrend === "declining") {
    suggestions.push("My accuracy has been dropping — what sections should I focus on to get back on track?");
  }

  // Streak-based suggestion
  if (summary.currentStreak >= 3) {
    suggestions.push(`I'm on a ${summary.currentStreak}-session streak — give me a challenge to keep it going`);
  }

  // Strong section suggestion
  if (summary.strongestSections.length > 0) {
    const strong = summary.strongestSections[0];
    suggestions.push(
      `I'm solid on ${strong.sectionName} — test me on the finer details to make it perfect`
    );
  }

  // Always have at least 4 suggestions
  const fallbacks = [
    "Give me an overall assessment of my progress",
    "What should I practice next based on my history?",
    "Quiz me on my weakest section",
    "Walk me through the parts I struggle with most",
  ];
  while (suggestions.length < 4) {
    suggestions.push(fallbacks[suggestions.length]!);
  }

  return suggestions.slice(0, 4);
}

export async function clearPerformanceHistory(): Promise<void> {
  const db = await openDB();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, "readwrite");
    const store = tx.objectStore(SESSIONS_STORE);
    const request = store.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LINE_SCORES_STORE, "readwrite");
    const store = tx.objectStore(LINE_SCORES_STORE);
    const request = store.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });

  db.close();
}
