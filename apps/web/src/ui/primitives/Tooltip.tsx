'use client';

/**
 * CSS-first tooltip: ink pill above the trigger on hover/focus, 300ms delay,
 * no JS. Replaces native title= attributes (which are slow and unstyled).
 */
export function Tooltip({
  label,
  side = 'top',
  children,
  className = '',
}: {
  label: string;
  side?: 'top' | 'bottom';
  children: React.ReactNode;
  className?: string;
}) {
  const pos =
    side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5';
  return (
    <span className={`group/tt relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-[80] -translate-x-1/2 whitespace-nowrap rounded-sm bg-brand-text px-2 py-1 text-xs font-medium text-brand-surface opacity-0 shadow-e1 transition-opacity delay-300 duration-150 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100 ${pos}`}
      >
        {label}
      </span>
    </span>
  );
}
