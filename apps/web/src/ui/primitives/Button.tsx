'use client';

import { forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'accent' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  /** Ink button — the app's main CTA (matches the landing's btn-primary). */
  primary:
    'bg-brand-text text-brand-surface shadow-e1 hover:opacity-90 disabled:opacity-40',
  /** Violet — selected/toggled-on states and highlighted actions. */
  accent: 'bg-brand-primary text-white shadow-e1 hover:opacity-90 disabled:opacity-40',
  /** Glass outline — secondary actions on any surface. */
  ghost:
    'bg-brand-surface/70 text-brand-text border border-line/15 backdrop-blur hover:bg-brand-surface disabled:opacity-40',
  danger: 'bg-danger text-white shadow-e1 hover:opacity-90 disabled:opacity-40',
  /** Quiet text-like button for low-emphasis actions inside panels. */
  subtle: 'text-brand-text/70 hover:bg-line/8 hover:text-brand-text disabled:opacity-40',
};

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-[13px] gap-1.5 rounded-sm',
  md: 'px-3.5 py-2 text-sm gap-2 rounded-md',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'ghost', size = 'md', icon: Ico, loading, className = '', children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex select-none items-center justify-center font-medium transition-[background,opacity,transform] duration-150 active:scale-[0.98] ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === 'sm' ? 12 : 14} />
      ) : (
        Ico && <Ico size={size === 'sm' ? 14 : 16} strokeWidth={1.75} aria-hidden="true" />
      )}
      {children}
    </button>
  );
});

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Required — icon-only buttons must always be labelled. */
  'aria-label': string;
  variant?: Variant;
  size?: Size;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Ico, variant = 'subtle', size = 'md', active, className = '', ...rest },
  ref,
) {
  const pad = size === 'sm' ? 'p-1.5 rounded-sm' : 'p-2 rounded-md';
  const look = active ? VARIANTS.accent : VARIANTS[variant];
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center transition-[background,opacity,transform] duration-150 active:scale-[0.96] ${look} ${pad} ${className}`}
      {...rest}
    >
      <Ico size={size === 'sm' ? 15 : 17} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
});
