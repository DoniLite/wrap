---
title: Getting started
nav_order: 2
---

## Requirements

[Bun](https://bun.sh) ≥ 1.2. Postgres (and optionally Redis) only if you pick the **full backend** profile — every other profile needs neither.

## Scaffold a project

```bash
bunx @donilite/create-wrap
```

Prompts, in order:

1. **Project name** (or pass it as the first CLI argument: `bunx @donilite/create-wrap my-app`).
2. **What kind of project is this?** — one of five profiles:

   | Profile | What you get |
   |---|---|
   | Full backend | Postgres + Drizzle, Redis cache, realtime websockets, auth — everything |
   | Lightweight API / auth-only | No DB, no cache, no realtime — routes + auth + OpenAPI docs |
   | External API aggregator | No DB — services that call out to other APIs, fronted by controllers |
   | Fullstack SSR | Hono + TanStack Router + React, server-rendered (no DB by default) |
   | Proxy / gateway | HTTP reverse-proxy (`hono/proxy`) + best-effort WebSocket proxy |

3. **Full backend only**: two more yes/no follow-ups — enable the Redis cache backend? enable realtime websockets?

The CLI then scaffolds the project, patches `package.json` (project name, pinned `@donilite/wrap` version), seeds `.env` from `.env.example`, and runs `bun install`. See the [CLI reference](cli/create-wrap.md) for exactly what each profile contains and how the profile-diff mechanism works.

## Run it

```bash
cd my-app
bun run init:env   # if not already done — copies .env.example -> .env
bun run dev         # hot reload
```

Full-backend profile only, before first run:

```bash
bun run wake:db     # docker compose up -d (Postgres, + Redis if enabled)
bun run push:db     # apply the Drizzle schema
```

Then open `http://localhost:5000/docs` for Swagger UI (every profile except full-stack-ssr serves it at the app root; fullstack-ssr serves JSON API docs the same way, with SSR pages living at `/`).

## The shape of a feature

Every profile follows the same controller → service (→ repository, if entity-backed) pattern; only the middle layer changes:

```ts
// Entity-backed (full backend)
class FooRepository extends BaseRepository<typeof Foo.table> { protected table = Foo.table; }
@Service() class FooService extends BaseService<FooRepository> { constructor() { super(new FooRepository()); } }
@Controller({ basePath: "/foos" })
class FooController extends BaseController<FooService> {
  constructor() { super(ServiceFactory.getService(FooService), webFactory.createApp()); }
}

// DB-free (lightweight-api, api-aggregator, fullstack-ssr, gateway)
@Service() class FooService extends WrapService { /* no repository */ }
@Controller({ basePath: "/foos" })
class FooController extends RouterController {
  constructor() { super(webFactory.createApp()); }
}
```

Register a controller as a child of another via `this.register(ChildController)` inside the parent's constructor (every generated `IndexController` does this for its feature controllers) — see [Architecture](guide/architecture.md) for why this composition order matters.

## Next

- [Architecture](guide/architecture.md) — how `Wrap`, controllers, services, and repositories fit together.
- [Auth](guide/auth.md) — `AuthController`, presets, and how to add your own paradigm.
- Full [API reference](index.md#api-reference) for every class and function.
