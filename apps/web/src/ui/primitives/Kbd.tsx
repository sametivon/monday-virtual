'use client';

/** Keyboard key cap for control hints. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.6rem] items-center justify-center rounded-sm border border-line/15 bg-brand-bg px-1.5 py-0.5 text-[11px] font-semibold text-brand-text/80 shadow-[0_1px_0_rgb(33_28_41_/_0.12)]">
      {children}
    </kbd>
  );
}
