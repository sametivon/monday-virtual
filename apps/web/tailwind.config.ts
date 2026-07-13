import type { Config } from 'tailwindcss';

/**
 * Design tokens (see globals.css for the CSS-var definitions).
 *
 * Brand colors read RGB channel triplets so Tailwind alpha modifiers work
 * (`text-brand-text/60` etc.) — a raw `var(--hex)` silently drops the alpha.
 * The tenant white-label palette overrides the vars at runtime
 * (lib/branding.ts); the semantic colors (success/warning/danger/line) are
 * the product's own language and are NOT tenant-themable.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'rgb(var(--brand-primary-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--brand-secondary-rgb) / <alpha-value>)',
          accent: 'rgb(var(--brand-accent-rgb) / <alpha-value>)',
          bg: 'rgb(var(--brand-bg-rgb) / <alpha-value>)',
          surface: 'rgb(var(--brand-surface-rgb) / <alpha-value>)',
          text: 'rgb(var(--brand-text-rgb) / <alpha-value>)',
        },
        success: 'rgb(var(--ui-success-rgb) / <alpha-value>)',
        warning: 'rgb(var(--ui-warning-rgb) / <alpha-value>)',
        danger: 'rgb(var(--ui-danger-rgb) / <alpha-value>)',
        /** Hairlines/borders: ink at low alpha — use as border-line/10 etc. */
        line: 'rgb(var(--ui-line-rgb) / <alpha-value>)',
        paper2: 'var(--ui-paper2)',
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '22px',
      },
      boxShadow: {
        /** chips/buttons */
        e1: '0 1px 2px rgb(33 28 41 / 0.06), 0 4px 12px -6px rgb(33 28 41 / 0.12)',
        /** panels/dock */
        e2: '0 22px 44px -26px rgb(33 28 41 / 0.42), inset 0 1px 0 rgb(255 255 255 / 0.7)',
        /** modals */
        e3: '0 34px 70px -30px rgb(33 28 41 / 0.5), inset 0 1px 0 rgb(255 255 255 / 0.7)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
