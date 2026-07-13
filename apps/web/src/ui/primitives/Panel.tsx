'use client';

type Variant = 'glass' | 'glass-strong' | 'solid';

const VARIANTS: Record<Variant, string> = {
  glass: 'glass',
  'glass-strong': 'glass-strong',
  solid: 'bg-brand-surface border border-line/10 shadow-e2',
};

/**
 * The app's one panel surface. Every floating HUD element, card, and sheet
 * uses this — a single radius/blur/elevation language instead of per-file
 * bg-black/NN improvisation.
 */
export function Panel({
  variant = 'glass',
  padding = 'md',
  className = '',
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: Variant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}) {
  const pad = { none: '', sm: 'p-2', md: 'p-3', lg: 'p-5' }[padding];
  return (
    <div className={`rounded-lg text-brand-text ${VARIANTS[variant]} ${pad} ${className}`} {...rest}>
      {children}
    </div>
  );
}
