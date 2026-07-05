# {{APP_NAME}}

Backend API built on [@donilite/wrap](https://github.com/DoniLite/wrap#readme) — Hono + Drizzle + Bun, vertical-slice, decorator-driven.

## Getting started

Prerequisites: [Bun](https://bun.sh) ≥ 1.2, [Docker](https://www.docker.com/) (PostgreSQL + Redis).

```bash
bun run wake:db   # start PostgreSQL + Redis
bun run push:db   # apply the schema
bun run dev       # http://localhost:5000/docs (Swagger UI)
bun test          # test suite (in-process PGlite, no docker needed)
```

## Project structure

```text
src/
├── bootstrap.ts          # env + database + cache — always the first import
├── index.ts              # Hono app, middlewares, realtime, Bun.serve
├── index.controller.ts   # API router (mounts each feature)
├── config/               # app configuration (env-driven)
├── db/index.ts           # re-exports every feature's entity module
├── factory/web.factory.ts# Variables + WrapRegistry augmentation
├── helpers/              # app-owned helpers (roles, ...)
├── middleware/auth.ts    # auth stack built from config
└── features/
    └── example/          # a vertical slice
        ├── entity/       # Entity classes + relations (single source of truth)
        ├── DTO/          # zod-backed DTOs derived from the entity
        ├── repository/   # BaseRepository subclass
        ├── services/     # BaseService subclass
        ├── web/          # BaseController subclass (@Get, @Post, ...)
        └── app/          # route mounting
tests/                    # bun:test suites (PGlite via @donilite/wrap/testing)
```

## Creating a feature

1. **Entity** — `src/features/post/entity/post.entity.ts`:

   ```ts
   export class Post extends Entity("posts", {
     title: text("title").notNull(),
     authorId: text("author_id").references(() => User.table.id),
   }) {}

   export const PostTable = Post.table;
   export const PostRelations = relationsOf(Post, ({ one, self }) => ({
     author: one(() => User, { fields: [self.authorId] }),
   }));
   ```

2. **Register it** in `src/db/index.ts`:

   ```ts
   export * from "@/features/post/entity/post.entity";
   ```

3. **DTOs** — derived, never re-declared:

   ```ts
   export const PostBase = SelectDTO(Post, { exclude: ["deletedAt"] });
   export class CreatePostDTO extends InsertDTO(Post) {}
   export const UpdatePostDTO = PartialDTO(CreatePostDTO);
   ```

4. **Repository / service / controller** (each a few lines — see the example slice), mount the controller in `src/index.controller.ts`, then:

   ```bash
   bun run push:db   # or generate:migrations + migrate:db
   ```

5. **Tests** — copy the patterns in `tests/`: `createTestDatabase({ schema })`, `testContext`, `requestJson`.

## Useful commands

| Command | Description |
| --- | --- |
| `bun run dev` | dev server with hot reload |
| `bun test` | test suite |
| `bun run typecheck` / `bun run lint` | static checks |
| `bun run wake:db` / `down:db` / `purge:db` | docker compose lifecycle |
| `bun run push:db` | push schema (dev) |
| `bun run generate:migrations` / `migrate:db` | migration workflow |

## Built-in goodies

- **Transactions**: `withTransaction(async () => { ... })` — implicit propagation, rollback on throw.
- **Entity events**: `onEntityEvent(Post, handler)` on every write (commit-aware).
- **Cache**: set `cacheTtl` on a repository; Redis backend is enabled by `REDIS_URL` (see `src/bootstrap.ts`).
- **Realtime**: connect to `ws://host/realtime`, send `{ "action": "subscribe", "channel": "entity:posts" }` and receive every write on the entity.
- **Auth**: `auth.authMiddleware` (JWT + cookie session), `auth.requireRoles(WRITE_ACCESS)`; roles live in `src/helpers/access.helper.ts`.
