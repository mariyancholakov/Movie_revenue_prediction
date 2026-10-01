import type { MetadataRoute } from 'next';

// What "Add to Home Screen" reads: the ticket-and-M as the app icon (full-bleed
// ink, so it holds its own on a home screen), newsprint for the splash screen
// and the status bar, and no browser chrome around the page.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MOVIEGROSS — The Box-Office Ledger',
    short_name: 'MOVIEGROSS',
    description: 'The predicted worldwide box-office run of every film now playing.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#EDE7DA',
    theme_color: '#EDE7DA',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
