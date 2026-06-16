import type { Metadata } from 'next';

const SITE = 'https://mondayvirtual.eu';
const TITLE = 'MondayVirtual — Your team’s office, inside monday.com';
const DESCRIPTION =
  'A 3D office your remote team actually walks into — built right into monday.com. Walk over, talk, and see your boards on the wall. No new tab, no scheduled call.';

/**
 * Public marketing layout (mondayvirtual.eu). Deliberately auth-free — no
 * MondayProvider — so visitors never hit the iframe session bootstrap. Owns the
 * SEO + Open Graph metadata; the OG image is treated like a thumbnail (#5).
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'virtual office',
    'monday.com app',
    'remote team',
    'virtual HQ',
    '3D workspace',
    'spatial audio',
    'team presence',
  ],
  alternates: { canonical: SITE },
  openGraph: {
    type: 'website',
    url: SITE,
    siteName: 'MondayVirtual',
    title: TITLE,
    description: DESCRIPTION,
    // PNG first (Slack/Twitter/LinkedIn prefer raster over SVG); SVG as fallback.
    images: [
      { url: '/og.png', width: 1200, height: 630, alt: 'MondayVirtual — your team’s office inside monday.com' },
      { url: '/og.svg', width: 1200, height: 630, alt: 'MondayVirtual — your team’s office inside monday.com' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og.png'],
  },
};

/**
 * Structured data (JSON-LD) for rich results: who we are (Organization), what
 * the product is + its pricing tiers (SoftwareApplication offers), and a short
 * FAQ. Kept in the layout so it renders on every marketing page.
 */
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#org`,
      name: 'MondayVirtual',
      url: SITE,
      logo: `${SITE}/og.png`,
    },
    {
      '@type': 'SoftwareApplication',
      name: 'MondayVirtual',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web (monday.com)',
      url: SITE,
      description: DESCRIPTION,
      offers: [
        { '@type': 'Offer', name: 'Team', price: '8', priceCurrency: 'EUR', description: 'Per seat / month, billed for teams up to 25.' },
        { '@type': 'Offer', name: 'Company', price: '14', priceCurrency: 'EUR', description: 'Per seat / month, for up to 250 seats with auditorium + white-label.' },
        { '@type': 'Offer', name: 'Enterprise', priceCurrency: 'EUR', description: 'Custom pricing — SSO, admin controls, custom scenes.' },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Does it work inside monday.com?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes — MondayVirtual runs as a monday.com app, embedded right in your account. There is no separate tab or login.' },
        },
        {
          '@type': 'Question',
          name: 'Can my team see our monday boards in the office?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes. Live boards render on the walls and screens of your 3D space, updating from the same data you already use.' },
        },
        {
          '@type': 'Question',
          name: 'Do people need to install anything?',
          acceptedAnswer: { '@type': 'Answer', text: 'No downloads. It runs in the browser, with spatial voice and video built in.' },
        },
      ],
    },
  ],
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    // `marketing-scroll` re-enables page scrolling + a light background that the
    // global (3D-app) styles turn off. Scoped here so the app is untouched.
    <div className="marketing-scroll min-h-screen bg-white text-neutral-900 antialiased">
      <script
        type="application/ld+json"
        // Server-rendered static JSON — safe; no user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      {children}
    </div>
  );
}
