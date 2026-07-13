import type { BrandingDTO } from '@mvs/shared';

const VAR_MAP: Record<keyof BrandingDTO['palette'], string> = {
  primary: '--brand-primary',
  secondary: '--brand-secondary',
  accent: '--brand-accent',
  background: '--brand-bg',
  surface: '--brand-surface',
  text: '--brand-text',
};

/** `#rrggbb` → `"r g b"` channel triplet (for `rgb(var(--x-rgb) / alpha)`). */
export function hexToRgbChannels(hex: string): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return `${(n >> 16) & 0xff} ${(n >> 8) & 0xff} ${n & 0xff}`;
}

/**
 * White-label at runtime: the tenant palette overrides the CSS variables that
 * every Tailwind brand-* class reads, and the product name becomes the tab
 * title. Each color is written as hex AND as an RGB channel triplet so
 * Tailwind alpha modifiers keep working. Called when the session loads and
 * live from the branding editor.
 */
export function applyBranding(branding: BrandingDTO): void {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(VAR_MAP)) {
    const hex = branding.palette[key as keyof BrandingDTO['palette']];
    root.style.setProperty(cssVar, hex);
    const channels = hexToRgbChannels(hex);
    if (channels) root.style.setProperty(`${cssVar}-rgb`, channels);
  }
  document.title = branding.productName;
}
