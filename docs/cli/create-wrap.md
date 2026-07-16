---
title: create-wrap CLI
nav_order: 5
---

`@donilite/create-wrap` — `packages/create-wrap`. Scaffolds a new `@donilite/wrap` project interactively, across five profiles.

## Usage

```sh
bunx @donilite/create-wrap [project-name]
```

`project-name` can be given as a CLI argument or left out — omitted, the CLI prompts for it (`text("Project name")`). Fails immediately (before any prompts) if the target directory already exists.

After the name, the CLI prompts for a **profile** and, for `full-backend` only, two yes/no follow-ups (Redis cache, realtime websockets). It then writes the project files, patches `package.json` (project name + the real `@donilite/wrap` version — template files reference a workspace link inside the monorepo, replaced with the CLI's own published version), seeds `.env` from `.env.example`, and runs `bun install` in the new directory.

## Profiles

```ts
type ProfileId = "full-backend" | "lightweight-api" | "api-aggregator" | "fullstack-ssr" | "gateway";
```

| Profile | What it scaffolds |
|---|---|
| **Full backend** | Postgres + Drizzle, Redis cache (optional), realtime websockets (optional), JWT+cookie auth — everything. The only profile with the two extra yes/no prompts. |
| **Lightweight API / auth-only** | No DB, no cache, no realtime — routes + auth + OpenAPI docs. `RouterController`-based features (no repository/service pair forced). |
| **External API aggregator** | No DB — services that call out to other APIs, fronted by controllers. Injected/stubbable `fetch` for testing. |
| **Fullstack SSR** | Hono + TanStack Router + React, server-rendered via `renderToString` (no DB by default). **No client hydration ships** — see the caveat below. |
| **Proxy / gateway** | HTTP reverse-proxy (`hono/proxy`) + a best-effort WebSocket proxy. Explicit limitations documented in the generated project's own `CLAUDE.md` (no backpressure, no reconnection, no auth-on-upgrade). |

Every non-`full-backend` profile is generated as a **diff against the full-backend template**: the base `template/` tree is copied first, then `profiles/<id>/remove.txt` deletes what that profile doesn't need (typically `drizzle.config.ts`, `compose.yml`, `src/db`, `src/features/example`, DB-dependent tests), then `profiles/<id>/files/` is copied on top (README, `.env.example`, `package.json`, profile-specific tests, `src/bootstrap.ts`, `src/index.ts`, `src/config/app.config.ts`, `src/factory/web.factory.ts`, plus profile-specific feature directories). `full-backend` itself has no `remove.txt`/`files/` — it's not a diff from anything; its two yes/no follow-ups are applied as small text-block edits (see below) rather than a whole alternate file set.

## `full-backend`'s follow-up prompts

```text
? Enable the Redis cache backend? (in-memory cache is always available either way) (Y/n)
? Enable realtime websockets (entity events fanned out over /realtime)? (Y/n)
```

Declining either strips the corresponding block from the generated `src/bootstrap.ts` / `src/index.ts` (import + wiring code removed, not just commented out), removes the Redis service from `compose.yml` if neither toggle needs it, and removes the `REDIS_URL`/`REDIS_PORT` block from `.env.example`. The in-memory [`CacheStore`](../api/helpers.md#cache) is always present regardless of this choice — declining only skips wiring `RedisCacheStore` as the backend.

## Fullstack SSR caveat

The generated SSR setup renders full HTML server-side (`renderToString` + TanStack Router's `RouterProvider`, via a plain Hono catch-all route) but ships **no client-side hydration** — there's no client entry bundle re-attaching React on the browser side. Pages are effectively static HTML with no client-side interactivity by default; adding hydration is left to the app (bundle a client entry, hydrate against the same route tree). This is called out explicitly in that profile's own generated `CLAUDE.md`.

## Placeholders

Every text file (extensions: `ts`, `tsx`, `jsx`, `json`, `md`, `yml`, `yaml`, `env`, `example`, `gitignore`, plus any dotfile) copied into a scaffolded project has these substituted:

| Placeholder | Value |
|---|---|
| `{{APP_NAME}}` | The project name, verbatim |
| `{{APP_NAME_SNAKE}}` | `toSnakeCase(projectName)` |
| `{{APP_NAME_PASCAL}}` | `toPascalCase(projectName)` |
| `{{DB_NAME}}` | `` `${toSnakeCase(projectName)}_db` `` |

This is how each generated project's own `CLAUDE.md` gets its app name filled in (see the [root CLAUDE.md](../index.md) for the framework-repo guide; the generated one is profile-specific and lives at the new project's root).

## Programmatic API

The scaffolding logic (`packages/create-wrap/src/scaffold.ts`) is a plain function, usable outside the interactive CLI (e.g. for testing, or a future non-interactive `--yes` mode):

```ts
interface Config { projectName: string; dbName: string; targetDir: string; }
interface ProfileAnswers { profile: ProfileId; enableRedisCache: boolean; enableRealtime: boolean; }

function scaffoldProject(config: Config, answers: ProfileAnswers, wrapVersion: string): void;
```

Not published as part of the CLI's public surface (no `exports` entry beyond the `bin`) — importing it directly means depending on `@donilite/create-wrap`'s internal module layout, which can change between releases without a semver bump.

## What gets skipped

`node_modules`, `bun.lock`, `.env`, `drizzle`, and `dist` are never copied from any source tree (base template or profile overlay) into a scaffolded project.

## Post-scaffold next steps

Printed by the CLI after a successful run:

```sh
cd <project-name>
bun run init:env   # copy .env.example -> .env (already done automatically, but safe to re-run)
bun run wake:db     # full-backend only: start PostgreSQL (+ Redis if either toggle was enabled)
bun run push:db     # full-backend only: apply the Drizzle schema
bun run dev          # start the dev server
```

Then visit `http://localhost:5000/docs` for the generated project's Swagger UI.
