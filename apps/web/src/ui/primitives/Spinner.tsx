'use client';

/** Accent ring spinner. Size in px. */
export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-brand-primary/25 border-t-brand-primary ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Shimmering placeholder block. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-line/8 ${className}`} />;
}
