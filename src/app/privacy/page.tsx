"use client";

import { useEffect, useState } from "react";
import {
  isOptedOutClient,
  setOptOutClient,
} from "@/lib/telemetry-consent";

export default function PrivacyPage() {
  const [optedOut, setOptedOut] = useState<boolean | null>(null);

  useEffect(() => {
    setOptedOut(isOptedOutClient());
  }, []);

  function toggle() {
    if (optedOut === null) return;
    const next = !optedOut;
    setOptOutClient(next);
    setOptedOut(next);
    // Reload so the telemetry client re-evaluates init state
    setTimeout(() => window.location.reload(), 150);
  }

  const telemetryConfigured = !!process.env.NEXT_PUBLIC_POSTHOG_KEY;

  return (
    <div className="prose prose-invert max-w-3xl mx-auto">
      <h1 className="text-3xl font-semibold text-amber-500 mb-2">
        Privacy and Analytics
      </h1>
      <p className="text-zinc-400 mb-6">
        How the Masonic Ritual Mentor handles your data, stated plainly.
      </p>

      <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 mb-6">
        <h2 className="text-lg font-semibold mb-3">Ritual content</h2>
        <p className="text-zinc-300 mb-2">
          Your ritual file (the <code>.mram</code> archive) never leaves your
          device in decrypted form. It is decrypted in your browser, kept in
          memory only, and never transmitted to any server &mdash; ours or
          anyone else&rsquo;s.
        </p>
        <p className="text-zinc-300">
          Transcripts of your spoken practice are sent to a speech-to-text
          provider (currently Groq&rsquo;s Whisper) for the sole purpose of
          returning an accuracy score, then discarded. They are not stored.
        </p>
      </section>

      <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 mb-6">
        <h2 className="text-lg font-semibold mb-3">Practice activity analytics</h2>
        <p className="text-zinc-300 mb-3">
          To understand whether Brothers are actually using the tool and where
          they get stuck, the site captures anonymous event data via{" "}
          <a
            href="https://posthog.com/"
            target="_blank"
            rel="noreferrer"
            className="text-amber-400 underline"
          >
            PostHog
          </a>{" "}
          (EU-hosted).
        </p>
        <h3 className="font-semibold mt-4 mb-2">Captured</h3>
        <ul className="list-disc pl-6 text-zinc-300 space-y-1">
          <li>Event names (e.g. <code>ritual.practice.started</code>, <code>ritual.line.passed</code>)</li>
          <li>Anonymous user ID (a hash of your email &mdash; never the email itself)</li>
          <li>Role indicator (WM, SW, JW, etc.) when relevant</li>
          <li>Opaque document ID, section/line index, duration, accuracy score</li>
          <li>Anonymous page views</li>
        </ul>
        <h3 className="font-semibold mt-4 mb-2">Never captured</h3>
        <ul className="list-disc pl-6 text-zinc-300 space-y-1">
          <li>Ritual text, decrypted or otherwise</li>
          <li>Passphrases</li>
          <li>Your raw email address</li>
          <li>Lodge names or numbers</li>
          <li>Voice recordings or transcripts (those do not enter the analytics pipeline)</li>
          <li>DOM element contents (autocapture is disabled)</li>
          <li>Session recordings (disabled, never enabled)</li>
        </ul>
        <h3 className="font-semibold mt-4 mb-2">Retention</h3>
        <p className="text-zinc-300">Events: 12 months rolling, then aggregated and discarded.</p>
      </section>

      <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 mb-6">
        <h2 className="text-lg font-semibold mb-3">Opt out</h2>
        {optedOut === null ? (
          <p className="text-zinc-400">Loading&hellip;</p>
        ) : (
          <>
            <p className="text-zinc-300 mb-4">
              Status:{" "}
              <span className={optedOut ? "text-zinc-400" : "text-amber-400"}>
                {optedOut ? "Analytics OFF" : "Analytics ON"}
              </span>
            </p>
            <button
              onClick={toggle}
              disabled={!telemetryConfigured && !optedOut}
              className={`px-4 py-2 rounded font-medium ${
                optedOut
                  ? "bg-amber-600 hover:bg-amber-500 text-zinc-950"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
              }`}
            >
              {optedOut ? "Turn analytics back ON" : "Turn analytics OFF"}
            </button>
            <p className="text-zinc-500 text-sm mt-3">
              Opting out excludes you from all aggregated reporting, including
              any future &ldquo;your lodge practiced X hours&rdquo; dashboards
              shown to a Worshipful Master.
            </p>
          </>
        )}
      </section>

      <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 mb-6">
        <h2 className="text-lg font-semibold mb-3">Source code</h2>
        <p className="text-zinc-300">
          This application is open source under AGPL v3. You can inspect
          exactly what is captured by reading <code>src/lib/log.ts</code>,
          <code>src/lib/posthog-server.ts</code>, and{" "}
          <code>src/components/PostHogProvider.tsx</code> in the repository.
        </p>
      </section>
    </div>
  );
}
