# @donilite/create-wrap

Scaffold a [@donilite/wrap](https://github.com/DoniLite/wrap#readme) backend project — Hono + Drizzle + Bun, vertical-slice, decorator-driven, test-driven.

```bash
bun create @donilite/wrap@latest my-app
# or
bunx @donilite/create-wrap@latest my-app
```

The generated project ships with:

- an `example` feature slice (entity + repository + service + controller + DTOs) demonstrating typed populate, entity-scope cache and soft delete
- PostgreSQL + Redis via `docker compose`, drizzle-kit wired
- Swagger UI on `/docs`, secure headers, request id, rate limiting, JWT auth
- realtime WebSocket endpoint on `/realtime` (entity events auto-published)
- a test suite on in-process PGlite (`bun test` — no docker needed)

First steps inside the project:

```bash
bun run wake:db   # start PostgreSQL + Redis
bun run push:db   # apply the schema
bun run dev       # http://localhost:5000/docs
bun test
```
