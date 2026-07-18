"use client";

import { RefreshCcw } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-4 text-[var(--ink)]">
      <div className="w-full max-w-md">
        <div className="masthead-rule" />
        <div className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--paper-raised)] p-6 shadow-resting">
          <p className="font-data text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-faint)]">
            StorePilot
          </p>
          <h1 className="font-display mt-2 text-3xl font-semibold leading-9">
            The presses jammed.
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
            Something went wrong while putting your brief together. Your data is
            fine. Try again, and if it keeps happening check the server logs.
          </p>
          {error.digest ? (
            <p className="font-data mt-3 text-xs text-[var(--ink-faint)]">
              Ref {error.digest}
            </p>
          ) : null}
          <button
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-[var(--forest)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--forest-deep)] focus-visible:ring-2 focus-visible:ring-[var(--forest)] focus-visible:ring-offset-2"
            onClick={() => reset()}
            type="button"
          >
            <RefreshCcw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
