import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  // Fallback for the app route group (the marketing layout overrides these with
  // full SEO metadata). A title template gives app pages a branded title.
  title: {
    default: 'MondayVirtual',
    template: '%s · MondayVirtual',
  },
  description: 'A 3D virtual office for your team, inside monday.com.',
};

/**
 * Bare root layout shared by both route groups. The monday auth provider lives
 * in (app)/layout so the public (marketing) landing page never tries to auth
 * against the monday iframe.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
