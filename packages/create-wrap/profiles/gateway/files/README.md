# {{APP_NAME}}

Proxy/gateway app built on [@donilite/wrap](https://github.com/DoniLite/wrap#readme) — Hono + Bun, decorator-driven. **No database** — this profile fronts other services (HTTP reverse-proxy + a best-effort WebSocket proxy) rather than owning data of its own.

## Getting started

Prerequisite: [Bun](https://bun.sh) ≥ 1.2 — no Docker, no Postgres, no Redis needed.

```bash
bun run init:env  # copy .env.example -> .env, then set UPSTREAM_BASE_URL
bun run dev        # http://localhost:5000/docs (Swagger UI)
bun test           # test suite
```

## Project structure

```text
src/
├── bootstrap.ts          # env — always the first import
├── index.ts              # Hono app, HTTP + WS proxy wiring, Bun.serve
├── index.controller.ts   # API router (mounts each feature)
├── config/                # app configuration (env-driven, incl. upstream.baseUrl)
├── factory/web.factory.ts # Variables + WrapRegistry augmentation
├── gateway/ws-proxy.ts    # WebSocket proxy helper — READ THE FILE HEADER
├── helpers/                # app-owned helpers (roles, ...)
├── middleware/auth.ts     # auth stack, available for management/admin routes
└── features/
    └── proxy/web/proxy.controller.ts  # HTTP reverse-proxy example (hono/proxy)
tests/                     # bun:test suites (no live network calls)
```

## HTTP proxying

`src/features/proxy/web/proxy.controller.ts` forwards `GET /proxy/*` to `appConfig.upstream.baseUrl` using Hono's built-in `proxy()` helper (`hono/proxy` — the standard approach, not a hand-rolled one). Add more methods/routes the same way; strip or forward headers as your upstream needs.

## WebSocket proxying — read this before relying on it

`src/gateway/ws-proxy.ts` is explicitly a **best-effort starting point**, documented as such in its file header: it relays frames bidirectionally and closes one side when the other closes, but has no backpressure handling, no upstream reconnection, and no built-in auth/rate-limiting on the upgrade itself. It's wired up in `src/index.ts` at `GET /ws-proxy/*`, defaulting to the same upstream as the HTTP proxy with its scheme swapped to `ws`/`wss`. Harden it (or use a purpose-built WS proxy) before depending on it in production.

## Growing into a database

If this project later needs to persist data of its own, look at the full-backend profile scaffolded by the same CLI (`bunx @donilite/create-wrap` → "Full backend"): copy its `src/bootstrap.ts` (adds `initializeDatabase()`), `drizzle.config.ts`, `compose.yml`, and `src/db/index.ts`.

## Useful commands

| Command | Description |
| --- | --- |
| `bun run dev` | dev server with hot reload |
| `bun test` | test suite |
| `bun run typecheck` / `bun run lint` | static checks |
