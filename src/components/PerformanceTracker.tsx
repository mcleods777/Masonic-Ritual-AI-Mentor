"use client";

import { useState, useEffect } from "react";
import {
  getPerformanceSummary,
  getAllSessions,
  clearPerformanceHistory,
  type PerformanceSummary,
  type PracticeSession,
} from "@/lib/performance-history";

export default function PerformanceTracker() {
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([getPerformanceSummary(), getAllSessions()])
      .then(([s, sess]) => {
        setSummary(s);
        setSessions(sess);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleClearHistory = async () => {
    await clearPerformanceHistory();
    setShowConfirmClear(false);
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!summary || summary.totalSessions === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-zinc-300">No Practice History Yet</h2>
        <p className="text-zinc-500 mt-2 max-w-md mx-auto">
          Complete a practice or rehearsal session to start tracking your progress.
          Your scores, trends, and trouble spots will appear here.
        </p>
      </div>
    );
  }

  const trendIcon = summary.recentTrend === "improving" ? "↗" : summary.recentTrend === "declining" ? "↘" : "→";
  const trendColor = summary.recentTrend === "improving" ? "text-green-400" : summary.recentTrend === "declining" ? "text-red-400" : "text-zinc-400";

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 text-center">
          <p className="text-3xl font-bold text-amber-400">{summary.averageAccuracy}%</p>
          <p className="text-xs text-zinc-500 mt-1">Average Accuracy</p>
        </div>
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 text-center">
          <p className="text-3xl font-bold text-zinc-200">{summary.totalSessions}</p>
          <p className="text-xs text-zinc-500 mt-1">Sessions</p>
        </div>
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 text-center">
          <p className={`text-3xl font-bold ${trendColor}`}>{trendIcon}</p>
          <p className="text-xs text-zinc-500 mt-1">
            {summary.recentTrend === "improving" ? "Improving" : summary.recentTrend === "declining" ? "Needs Work" : "Steady"}
          </p>
        </div>
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 text-center">
          <p className="text-3xl font-bold text-green-400">{summary.currentStreak}</p>
          <p className="text-xs text-zinc-500 mt-1">
            Streak {summary.longestStreak > summary.currentStreak && (
              <span className="text-zinc-600">(best: {summary.longestStreak})</span>
            )}
          </p>
        </div>
      </div>

      {/* Accuracy Sparkline (last 20 sessions) */}
      {sessions.length >= 2 && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wide mb-4">
            Accuracy Over Time
          </h3>
          <div className="flex items-end gap-1 h-24">
            {sessions
              .slice(0, 20)
              .reverse()
              .map((session, i) => {
                const height = Math.max(4, (session.overallAccuracy / 100) * 96);
                const color =
                  session.overallAccuracy >= 90 ? "bg-green-500" :
                  session.overallAccuracy >= 70 ? "bg-amber-500" :
                  session.overallAccuracy >= 50 ? "bg-orange-500" : "bg-red-500";
                return (
                  <div
                    key={session.id}
                    className="flex-1 flex flex-col items-center gap-1"
                    title={`${session.overallAccuracy}% — ${new Date(session.startedAt).toLocaleDateString()}`}
                  >
                    <div
                      className={`w-full rounded-sm ${color} transition-all`}
                      style={{ height: `${height}px` }}
                    />
                    {i === 0 || i === Math.min(sessions.length - 1, 19) ? (
                      <span className="text-[9px] text-zinc-600">
                        {new Date(sessions.slice(0, 20).reverse()[i]!.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Trouble Spots */}
      {summary.persistentTroubleSpots.length > 0 && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wide mb-3">
            Persistent Trouble Spots
          </h3>
          <p className="text-xs text-zinc-600 mb-3">
            Words you consistently miss across sessions
          </p>
          <div className="flex flex-wrap gap-2">
            {summary.persistentTroubleSpots.map((word) => (
              <span
                key={word}
                className="px-3 py-1 bg-red-900/30 text-red-300 border border-red-800/50 rounded-full text-sm"
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Weakest / Strongest Sections */}
      <div className="grid md:grid-cols-2 gap-4">
        {summary.weakestSections.length > 0 && (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
            <h3 className="text-sm font-medium text-red-400 uppercase tracking-wide mb-3">
              Needs Practice
            </h3>
            <div className="space-y-3">
              {summary.weakestSections.map((s) => (
                <div key={s.sectionName} className="flex items-center justify-between">
                  <div>
                    <p className="text-zinc-200 text-sm font-medium">{s.sectionName}</p>
                    <p className="text-xs text-zinc-600">{s.degree} &middot; {s.attempts} attempts</p>
                  </div>
                  <span className={`text-lg font-bold ${
                    s.averageAccuracy >= 70 ? "text-amber-400" :
                    s.averageAccuracy >= 50 ? "text-orange-400" : "text-red-400"
                  }`}>
                    {s.averageAccuracy}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {summary.strongestSections.length > 0 && (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
            <h3 className="text-sm font-medium text-green-400 uppercase tracking-wide mb-3">
              Your Best Work
            </h3>
            <div className="space-y-3">
              {summary.strongestSections.map((s) => (
                <div key={s.sectionName} className="flex items-center justify-between">
                  <div>
                    <p className="text-zinc-200 text-sm font-medium">{s.sectionName}</p>
                    <p className="text-xs text-zinc-600">{s.degree} &middot; {s.attempts} attempts</p>
                  </div>
                  <span className="text-lg font-bold text-green-400">{s.averageAccuracy}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent Sessions */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wide mb-3">
          Recent Sessions
        </h3>
        <div className="space-y-2">
          {sessions.slice(0, 10).map((session) => (
            <div
              key={session.id}
              className="flex items-center gap-3 px-4 py-3 bg-zinc-800/50 rounded-lg"
            >
              <span className={`text-lg font-bold w-12 text-right ${
                session.overallAccuracy >= 90 ? "text-green-400" :
                session.overallAccuracy >= 70 ? "text-amber-400" :
                session.overallAccuracy >= 50 ? "text-orange-400" : "text-red-400"
              }`}>
                {session.overallAccuracy}%
              </span>
              <span className="text-zinc-600">|</span>
              <div className="flex-1 min-w-0">
                <p className="text-zinc-300 text-sm truncate">
                  {session.sectionName || session.documentTitle}
                </p>
                <p className="text-xs text-zinc-600">
                  {session.mode === "rehearsal" ? `Rehearsal as ${session.role}` : "Solo Practice"}
                  {" "}&middot;{" "}
                  {session.linesAttempted} lines
                  {" "}&middot;{" "}
                  {new Date(session.startedAt).toLocaleDateString()}
                </p>
              </div>
              {session.linesNailed > 0 && (
                <span className="text-xs text-green-500 flex-shrink-0">
                  {session.linesNailed} nailed
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Clear History */}
      <div className="flex justify-end">
        {showConfirmClear ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Are you sure?</span>
            <button
              onClick={handleClearHistory}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded transition-colors"
            >
              Yes, Clear All
            </button>
            <button
              onClick={() => setShowConfirmClear(false)}
              className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirmClear(true)}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Clear History
          </button>
        )}
      </div>
    </div>
  );
}
