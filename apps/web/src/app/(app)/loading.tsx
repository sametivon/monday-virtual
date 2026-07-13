/** Route-level loading state for the app group — quiet branded spinner. */
export default function Loading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <span
        role="status"
        aria-label="Loading"
        className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-brand-primary/25 border-t-brand-primary"
      />
      <p className="text-sm text-brand-text/55">Loading…</p>
    </div>
  );
}
