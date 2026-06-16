import type { MetadataRoute } from 'next';

const SITE = 'https://mondayvirtual.eu';

/**
 * Sitemap for crawlers. Only the PUBLIC marketing surface is listed — the app
 * (`/`, `/space/*`) is auth-gated behind the monday iframe and must not be
 * indexed. `/home` is the canonical public landing page.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE}/home`,
      lastModified: new Date('2026-06-14'),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
