# @rivus/web — Agent Task Loop landing site

The marketing / landing site for [Agent Task Loop](https://github.com/PerfectPan/agent-task-loop).

## Stack

- **Next.js 15** (App Router, React Server Components) + **React 19**
- **Tailwind CSS v4** (CSS-first `@theme` tokens)
- **TypeScript** (strict)

The homepage is a Server Component that fetches **real** project data at build time
(ISR, hourly revalidate) from the npm registry and GitHub API — latest version,
monthly downloads, stars and forks — with graceful fallbacks so the build never
fails offline. See `lib/data.ts`.

## Develop

```bash
pnpm --filter @rivus/web dev     # http://localhost:3000
pnpm --filter @rivus/web build   # production build
```

## Deploy to Vercel

This app lives in a pnpm monorepo. In the Vercel project settings:

- **Root Directory:** `apps/web`
- **Framework Preset:** Next.js (auto-detected)
- **Install Command:** `pnpm install` (run at repo root; Vercel handles the workspace)
- **Build Command:** `pnpm build` (default `next build`)

No environment variables are required — all data is fetched from public APIs.
