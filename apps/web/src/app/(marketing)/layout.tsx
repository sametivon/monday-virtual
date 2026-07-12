import type { Metadata } from 'next';
import { FAQ } from './home/content';

const SITE = 'https://mondayvirtual.eu';
const PAGE = `${SITE}/home`;
const TITLE = 'MondayVirtual — Virtual meetings & office inside monday.com';
const DESCRIPTION =
  'Run virtual meetings, all-hands and hybrid collaboration inside monday.com. A 3D team office with proximity voice & video, screen sharing, and live boards on the walls — no new app to install.';

/**
 * Public marketing layout (mondayvirtual.eu/home). Deliberately auth-free — no
 * MondayProvider — so visitors never hit the iframe session bootstrap. Owns the
 * full SEO + Open Graph metadata and the structured data (JSON-LD).
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'MondayVirtual',
  authors: [{ name: 'MondayVirtual' }],
  keywords: [
    'monday.com virtual meetings',
    'virtual meetings for monday.com',
    'monday.com meeting app',
    'monday collaboration software',
    'video conferencing for monday.com',
    'online meetings inside monday.com',
    'meeting management for monday.com',
    'remote collaboration',
    'hybrid work software',
    'team collaboration platform',
    'virtual office',
    'virtual auditorium',
    'spatial audio',
    'all-hands meeting',
  ],
  alternates: { canonical: PAGE },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  openGraph: {
    type: 'website',
    url: PAGE,
    siteName: 'MondayVirtual',
    title: TITLE,
    description: DESCRIPTION,
    images: [
      { url: '/og.png', width: 1200, height: 630, alt: 'MondayVirtual — a 3D virtual office and meeting space inside monday.com' },
      { url: '/og.svg', width: 1200, height: 630, alt: 'MondayVirtual — a 3D virtual office and meeting space inside monday.com' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og.png'],
  },
  category: 'business',
};

/** Structured data for rich results + AI answer engines. */
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#org`,
      name: 'MondayVirtual',
      url: SITE,
      logo: `${SITE}/og.png`,
      description: DESCRIPTION,
      contactPoint: { '@type': 'ContactPoint', email: 'sam@skortmens.com', contactType: 'sales' },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: SITE,
      name: 'MondayVirtual',
      publisher: { '@id': `${SITE}/#org` },
      inLanguage: 'en',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE}/#app`,
      name: 'MondayVirtual',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Video conferencing & team collaboration',
      operatingSystem: 'Web (runs inside monday.com)',
      url: PAGE,
      description: DESCRIPTION,
      featureList: [
        'Virtual meetings inside monday.com',
        'Proximity voice and video',
        'Company-wide auditorium for all-hands',
        'Screen sharing to a whole room',
        'Live monday.com boards on the walls',
        'Whiteboards and huddle tables',
        'White-label branding',
        'No downloads — runs in the browser',
      ],
      offers: [
        { '@type': 'Offer', name: 'Team', price: '8', priceCurrency: 'EUR', description: 'Per seat / month — lobby, proximity voice & video, boards on the walls.' },
        { '@type': 'Offer', name: 'Company', price: '14', priceCurrency: 'EUR', description: 'Per seat / month — the full campus with auditorium, events and white-label branding.' },
        { '@type': 'Offer', name: 'Enterprise', priceCurrency: 'EUR', description: 'Custom pricing — SSO, roles, GDPR tooling and priority support.' },
      ],
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'MondayVirtual for monday.com', item: PAGE },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-scroll min-h-screen bg-white text-neutral-900 antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      {children}
    </div>
  );
}
