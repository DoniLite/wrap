# CLAUDE.md — {{APP_NAME}}

Scaffolded with `bunx @donilite/create-wrap@latest` (**fullstack-ssr** profile: Hono backend + TanStack Router + React pages, server-rendered from the same app; no database by default). Full framework API reference: **[link the docs site here once deployed]**. See `README.md` for the getting-started walkthrough — this file is LLM-oriented guidance on top of it, read the "What this profile is — and isn't — set up for" section there before assuming anything works that isn't listed as shipped.

## The mechanism (there's no new `Wrap` primitive for SSR)

`src/index.ts` mounts a plain Hono catch-all — `app.get("*", async (c) => c.html(await renderPage(c)))` — *after* the `/api` routes. `src/ssr/render.tsx`'s `renderPage()` builds a fresh TanStack Router instance per request (`src/ssr/router.ts`'s `createAppRouter`, seeded with `createMemoryHistory` at the request path — there's no browser `window.location` server-side, and a shared router instance across concurrent requests would leak navigation state between them), loads it, and renders with `renderToString`. **This is the whole integration** — treat "mount a Hono route that renders something" as the pattern for any future SSR-adjacent work here, not a framework feature to look for in `@donilite/wrap` itself.

## Adding a page

Add a `createRoute({ getParentRoute: () => rootRoute, path: "/your-path", component: () => <YourComponent /> })` to `src/ssr/routes.tsx` and list it in `rootRoute.addChildren([...])`. The catch-all picks it up automatically — no routing config anywhere else.

## No client hydration — don't assume interactivity works

Pages are server-rendered HTML only. There is no client JS bundle, no `hydrateRoot()`, no build step wired up. If asked to add client-side interactivity, that's new work (pick a bundler, add a client entry point mirroring the route tree, serve the built assets statically) — say so explicitly rather than writing `onClick` handlers that will silently do nothing since no client bundle will ever run them.

## JSON API routes

Keep them under `/api` (mounted via `src/index.controller.ts`, same `RouterController`/`this.register(...)` pattern as every other profile) — the SSR catch-all is registered after `/api`, so anything outside that prefix falls through to page rendering, not your API route.

## Testing

`tests/ssr.test.ts` exercises `renderPage()` directly (route match + rendered HTML contains expected content) — that's the pattern for testing new pages too. `tests/wrap.test.ts` covers the `/api` side the same way every other profile does (`requestJson` through a real `Wrap`/`IndexController`). No `createTestDatabase` — no schema.
