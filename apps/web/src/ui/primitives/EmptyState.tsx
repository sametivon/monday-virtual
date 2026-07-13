'use client';

import type { LucideIcon } from 'lucide-react';

/** Quiet, centered empty state: soft icon disc, serif heading, muted body. */
export function EmptyState({
  icon: Ico,
  title,
  body,
  action,
  className = '',
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 px-6 py-12 text-center ${className}`}>
      <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-primary/10 text-brand-primary">
        <Ico size={20} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h3 className="font-display text-lg text-brand-text">{title}</h3>
      {body && <p className="max-w-sm text-sm text-brand-text/60">{body}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
