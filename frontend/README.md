# MOVIEGROSS frontend

Next.js 16 (App Router) + Tailwind CSS v4. See the [root README](../README.md)
for setup, the API it talks to, and deployment.

```bash
npm install
npm run dev     # http://localhost:3000; API from NEXT_PUBLIC_API_URL in .env.local (default http://127.0.0.1:5000)
npm run build   # fails fast if NEXT_PUBLIC_API_URL is unset
npm run lint
```

This Next.js version has breaking changes from older releases. Read
`node_modules/next/dist/docs/` before changing framework APIs (see `AGENTS.md`).
