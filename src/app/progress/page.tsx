"use client";

import PerformanceTracker from "@/components/PerformanceTracker";

export default function ProgressPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-cinzel uppercase tracking-[0.18em] text-zinc-100">Progress</h1>
        <p className="text-zinc-500 mt-1">
          Track your accuracy, streaks, and trouble spots across practice sessions.
        </p>
      </div>
      <PerformanceTracker />
    </div>
  );
}
