# Profiles

`bunx @donilite/create-wrap@latest` asks what kind of project to scaffold (see
`src/profiles.ts`). Every profile is generated from the SAME base —
`packages/create-wrap/template/` — which is itself the "full-backend"
profile's file tree (Postgres + Drizzle, Redis cache, realtime, auth,
everything). This directory holds the DIFF each other profile applies on
top of that base, rather than a fully duplicated template tree per
profile — easier to keep in sync as `template/` evolves.

## Mechanics

For a given profile `<id>` (anything except `full-backend`), scaffolding
(`src/scaffold.ts`'s `scaffoldProject()`) does, in order:

1. Copy `template/` to the target directory (with `{{PLACEHOLDER}}`
   substitution — same as any profile).
2. Delete every path listed in `profiles/<id>/remove.txt` (one
   project-relative path per line; `#` comments and blank lines ignored).
3. Copy `profiles/<id>/files/` on top of the target directory (same
   placeholder substitution, so profile files can use
   `{{APP_NAME}}`/`{{APP_NAME_SNAKE}}`/`{{APP_NAME_PASCAL}}`/`{{DB_NAME}}`
   too) — this both adds new files (e.g. a profile-specific feature slice)
   and overwrites shared ones that need different content per profile
   (`package.json`, `src/bootstrap.ts`, `src/index.ts`,
   `src/config/app.config.ts`, `tests/*`, `README.md`, ...).

`full-backend` has no `remove.txt`/`files/` — it doesn't need one, it IS
the base — but it does have two yes/no follow-up prompts (Redis cache,
realtime websockets), applied as small text edits directly to the copied
template (`applyFullBackendToggles()` in `scaffold.ts`) rather than a
whole alternate file set, since each is a single conditional block.

## Adding a profile

1. Add an entry to `PROFILES` in `src/profiles.ts` (id, label, hint), and
   any profile-specific follow-up prompts in `promptForAnswers()`.
2. Create `profiles/<id>/remove.txt` listing what the full-backend base
   doesn't need for this profile (e.g. `drizzle.config.ts`, `compose.yml`,
   `src/db`, DB-dependent tests).
3. Create `profiles/<id>/files/` with whatever replaces or adds to what
   was removed — same directory layout as `template/`. At minimum this
   usually means a rewritten `package.json` (drop DB-only
   devDependencies/scripts), `src/bootstrap.ts` (no `initializeDatabase()`
   if there's no DB), `src/config/app.config.ts` (drop the sections that
   don't apply), and a profile-appropriate example feature + tests.
4. Update `src/scaffold.ts`'s `TEXT_EXTENSIONS` if the profile introduces
   a new file extension that needs placeholder substitution (`.tsx` was
   added for the `fullstack-ssr` profile's React components).

## Current profiles

| id | What it drops from full-backend | What it adds |
| --- | --- | --- |
| `lightweight-api` | DB, Drizzle tooling, cache/storage/email config | a DB-free `greeting` feature (`WrapService`/`RouterController`, no repository) |
| `api-aggregator` | same as lightweight-api | an `aggregator` feature calling an upstream API (fetch injected for testability) |
| `fullstack-ssr` | same as lightweight-api | TanStack Router + React, server-rendered via a Hono catch-all (`src/ssr/`) — no client hydration yet, see that profile's README |
| `gateway` | same as lightweight-api | an HTTP reverse-proxy (`hono/proxy`) + a best-effort WebSocket proxy helper (`src/gateway/ws-proxy.ts`) |

`drizzle-orm`/`drizzle-zod`/`pg` stay as dependencies in every profile,
even DB-free ones — `@donilite/wrap`'s own barrel (`entity.ts`, `events.ts`,
`dto.ts`, `database.ts`) imports them unconditionally at the module level
(e.g. `drizzle-orm`'s `getTableName`), even though establishing an actual
DB *connection* is fully opt-in (`initializeDatabase()` is never called
unless the app calls it). So these three packages are a real, unconditional
module-resolution dependency of `@donilite/wrap` itself, not just of the
full-backend profile — removing them from a DB-free profile's
`package.json` would break `import "@donilite/wrap"` at runtime with
"Cannot find package 'drizzle-orm'". What DOES get dropped for DB-free
profiles is the actual DB *tooling* that's genuinely unused without a
schema: `drizzle-kit` (migrations), `@electric-sql/pglite` (test DB),
`@types/pg`. Decoupling `@donilite/wrap`'s own barrel from a hard
`drizzle-orm` import is a real, separate refactor (lazy-loading those
modules) — flagged here as a follow-up, not attempted as part of this pass.
