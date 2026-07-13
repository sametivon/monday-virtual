'use client';

import { AlertTriangle } from 'lucide-react';

/** Route-level error boundary for the app group — branded, with a retry. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle size={20} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h1 className="font-display text-xl text-brand-text">Something went wrong</h1>
      <p className="max-w-sm text-sm text-brand-text/60">
        {error.message || 'An unexpected error interrupted the page.'}
      </p>
      <button
        onClick={reset}
        className="mt-1 rounded-md bg-brand-text px-4 py-2 text-sm font-medium text-brand-surface shadow-e1 transition hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
