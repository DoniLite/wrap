# {{APP_NAME}}

Fullstack SSR app built on [@donilite/wrap](https://github.com/DoniLite/wrap#readme) — Hono + Bun backend, [TanStack Router](https://tanstack.com/router) + React pages, rendered server-side from the same app. **No database** by default — add one (see below) if this app needs to persist data alongside its pages.

## What this profile is — and isn't — set up for

**Ships, working end to end:** an HTTP request hits a Hono catch-all route (`src/index.ts`), TanStack Router resolves which page matches (`src/ssr/routes.tsx`), and React renders it to an HTML string server-side (`src/ssr/render.tsx`). `bun run dev` and load `http://localhost:5000/` to see it.

**Does NOT ship:** client-side hydration. There's no client JS bundle wired up (no Vite/esbuild build step in this template) — pages are server-rendered HTML only, no `hydrateRoot()`, no client-side interactivity beyond plain links/forms/browser-native behavior. Wiring a client bundle is real, separate work (pick a bundler, add a client entry point that calls `hydrateRoot()` with the same route tree, serve the built assets as static files) — intentionally left as a follow-up rather than guessed at. `src/ssr/render.tsx`'s header comment has the same note.

## Getting started

Prerequisite: [Bun](https://bun.sh) ≥ 1.2 — no Docker, no Postgres, no Redis needed (unless you add a database — see below).

```bash
bun run init:env  # copy .env.example -> .env
bun run dev        # http://localhost:5000 (SSR pages), /docs (Swagger UI for /api routes)
bun test           # test suite
```

## Project structure

```text
src/
├── bootstrap.ts          # env — always the first import
├── index.ts              # Hono app: /api routes, Swagger, SSR catch-all, Bun.serve
├── index.controller.ts   # JSON API router, mounted at /api (not / — SSR owns /)
├── config/                # app configuration (env-driven)
├── factory/web.factory.ts # Variables + WrapRegistry augmentation
├── helpers/                # app-owned helpers (roles, ...)
├── middleware/auth.ts     # auth stack, usable on /api routes
└── ssr/
    ├── routes.tsx          # TanStack Router route tree — add pages here
    ├── router.ts            # per-request router factory (createMemoryHistory)
    └── render.tsx           # renderPage(): route match + React SSR -> HTML string
tests/                     # bun:test suites (SSR + /api)
```

## Adding a page

Add a route to `src/ssr/routes.tsx` (`createRoute({ getParentRoute: () => rootRoute, path: "/your-path", component: () => <YourComponent /> })`) and add it to `rootRoute.addChildren([...])`. That's it — the catch-all in `src/index.ts` picks it up automatically.

## Adding a JSON API route

Same pattern as the other profiles: extend `RouterController` (or `BaseController<Service>` once you have a DB), mount it from `src/index.controller.ts`. Keep API routes under `/api` so they don't collide with SSR page paths.

## Growing into a database

Look at the full-backend profile scaffolded by the same CLI (`bunx @donilite/create-wrap@latest` → "Full backend"): copy its `src/bootstrap.ts` (adds `initializeDatabase()`), `drizzle.config.ts`, `compose.yml`, and `src/db/index.ts`.

## Useful commands

| Command | Description |
| --- | --- |
| `bun run dev` | dev server with hot reload |
| `bun test` | test suite |
| `bun run typecheck` / `bun run lint` | static checks |
