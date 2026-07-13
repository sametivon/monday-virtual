import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// Self-hosted at build time by next/font — no runtime CDN request, no CLS.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  // Fallback for the app route group (the marketing layout overrides these with
  // full SEO metadata). A title template gives app pages a branded title.
  title: {
    default: 'MondayVirtual',
    template: '%s · MondayVirtual',
  },
  description: 'A virtual office for your team, inside monday.com.',
};

export const viewport: Viewport = {
  themeColor: '#faf7f2',
  width: 'device-width',
  initialScale: 1,
};

/**
 * Bare root layout shared by both route groups. The monday auth provider lives
 * in (app)/layout so the public (marketing) landing page never tries to auth
 * against the monday iframe.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
