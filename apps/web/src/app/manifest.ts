import type { MetadataRoute } from 'next';

/** PWA manifest (C3): installable pop-out with the brand mark and paper theme. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MondayVirtual — your virtual office',
    short_name: 'MondayVirtual',
    description:
      "Walkable 3D offices inside monday.com — proximity voice, live presenting, whiteboards, and monday boards on the walls.",
    start_url: '/',
    display: 'standalone',
    background_color: '#faf7f2',
    theme_color: '#faf7f2',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
