// The site's public origin, for absolute URLs (sitemap, robots, link
// previews). Vercel sets VERCEL_PROJECT_PRODUCTION_URL (no scheme) on every
// build; SITE_URL overrides it, e.g. for a custom domain.
export const SITE_URL = (
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')
).replace(/\/$/, '');
