import type { BrandingDTO } from '@mvs/shared';

const VAR_MAP: Record<keyof BrandingDTO['palette'], string> = {
  primary: '--brand-primary',
  secondary: '--brand-secondary',
  accent: '--brand-accent',
  background: '--brand-bg',
  surface: '--brand-surface',
  text: '--brand-text',
};

/**
 * White-label at runtime: the tenant palette overrides the CSS variables that
 * every Tailwind brand-* class reads, and the product name becomes the tab
 * title. Called when the session loads and live from the branding editor.
 */
export function applyBranding(branding: BrandingDTO): void {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(VAR_MAP)) {
    root.style.setProperty(cssVar, branding.palette[key as keyof BrandingDTO['palette']]);
  }
  document.title = branding.productName;
}
