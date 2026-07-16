# CLAUDE.md — {{APP_NAME}}

Scaffolded with `bunx @donilite/create-wrap@latest` (**gateway** profile: HTTP reverse-proxy + best-effort WebSocket proxy, no database — this app fronts other services rather than owning data). Full framework API reference: **[link the docs site here once deployed]**. See `README.md` for the getting-started walkthrough — this file is LLM-oriented guidance on top of it.

## HTTP proxying

`src/features/proxy/web/proxy.controller.ts` is the pattern: a `RouterController` (no repository) whose handler calls Hono's built-in `proxy()` (`hono/proxy` — always reach for this, don't hand-roll a fetch-and-relay proxy) against `appConfig.upstream.baseUrl`. Add more upstream routes the same way — a `RouterController`, `@Get`/`@Post`/etc. decorated methods calling `proxy(url, { headers })`, registered via `this.register(...)` in `src/index.controller.ts`.

## WebSocket proxying — read `src/gateway/ws-proxy.ts`'s header before touching it

It is explicitly a **starting point**, not production-hardened, and says so in its own file header: no backpressure handling, no upstream reconnection, no auth on the upgrade itself, no per-message limits. If asked to make WS proxying production-ready, treat that as real, scoped work (pick which of those gaps matter for the actual use case and close them deliberately) — don't claim it's already solid, and don't silently paper over one of the listed gaps without calling it out. `wsProxy({ target, protocols? })` returns a Hono route handler; combine `wsProxyWebSocketHandlers` into the same `Bun.serve({ websocket })` call as any other WS handler in the app (mirrors how `@donilite/wrap/realtime`'s `createRealtime()` is wired, if this project also uses that).

## Auth

`src/middleware/auth.ts` ships the same `JwtCookieAuthController` stack as other profiles, meant for gateway management/admin routes (e.g. guarding proxy config endpoints), not for the proxied traffic itself — a proxy target usually does its own auth, and `proxyGet()` in the reference controller deliberately strips the `Authorization` header before forwarding (opt back in per-route if a specific upstream expects this app's auth to pass through).

## Testing

No `createTestDatabase`, no live network calls in `tests/`. When adding a proxy route, test the routing/header logic (what gets forwarded, what gets stripped) rather than hitting a real upstream — stub `fetch`/the proxy call the same way `api-aggregator`'s tests stub theirs if you need to assert on outbound requests.
