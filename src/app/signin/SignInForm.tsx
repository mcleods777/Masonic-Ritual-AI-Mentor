"use client";

import { useEffect, useState, use } from "react";

export default function SignInForm({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ error?: string; "signed-out"?: string }>;
}) {
  const searchParams = use(searchParamsPromise);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.error === "invalid-link") {
      setErrorMessage(
        "That sign-in link is no longer valid. Links expire after 10 minutes. Request a new one below.",
      );
    }
  }, [searchParams.error]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setStatus("sending");

    try {
      const resp = await fetch("/api/auth/magic-link/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!resp.ok) {
        const data: { error?: string } = await resp.json().catch(() => ({}));
        setErrorMessage(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }

      setStatus("sent");
    } catch {
      setErrorMessage("Network error. Please try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="text-center space-y-4">
        <p className="text-zinc-200">
          If your email is on the pilot list, a sign-in link is on its way.
        </p>
        <p className="text-xs text-zinc-500">
          The link expires in 10 minutes. Check your inbox (and spam folder).
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {searchParams["signed-out"] === "1" && (
        <p
          className="text-center text-xs text-zinc-400 -mt-4 mb-2"
          role="status"
        >
          You have been signed out.
        </p>
      )}

      <div>
        <label htmlFor="email" className="block text-xs text-zinc-400 mb-2 tracking-wider">
          EMAIL
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "sending"}
          className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-amber-500 disabled:opacity-50"
          placeholder="brother@example.com"
        />
      </div>

      {errorMessage && (
        <p className="text-sm text-red-400" role="alert">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full px-4 py-3 bg-amber-600 hover:bg-amber-500 text-zinc-950 font-medium rounded tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        style={{ fontFamily: "Cinzel, serif", letterSpacing: "0.12em" }}
      >
        {status === "sending" ? "SENDING..." : "SEND SIGN-IN LINK"}
      </button>
    </form>
  );
}
