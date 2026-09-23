// Base URL of the Flask API. NEXT_PUBLIC_ vars are inlined at build time;
// next.config.ts refuses a production build without it, so the localhost
// fallback only ever applies to `next dev`.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:5000';
