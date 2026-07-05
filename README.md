# wrap

**OOP backend framework on [Hono](https://hono.dev) + [Drizzle](https://orm.drizzle.team) — Bun-first, vertical-slice, decorator-driven.**

`wrap` brings the Repository/Service/Controller discipline of frameworks like Spring Boot to the Bun ecosystem, without fighting TypeScript: the Drizzle table is the **single source of truth**, and typing, validation, serialization and OpenAPI are all derived from it.

```ts
// features/user/entity/user.entity.ts — the whole definition lives in the slice
export class User extends Entity("users", {
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
}) {}

export const UserTable = User.table;
export const UserRelations = relationsOf(User, ({ many }) => ({
  posts: many(() => Post),
}));
```

```ts
// One line each — everything is inferred
@Repository("UserRepository")
export class UserRepository extends BaseRepository<typeof User.table, CreateUserDTO> {
  protected table = User.table;
  protected override relationalQuery = () => this.db.query.UserTable;
  protected override defaultWith = { posts: true } as const;
  protected override cacheTtl = 60; // entity-scope cache, auto-invalidated
}

@Service()
export class UserService extends BaseService<UserRepository> {}

@Controller({ basePath: "/api/users", tags: ["Users"] })
export class UserController extends BaseController<UserService> { /* @Get, @Post... */ }
```

## Quick start

```bash
bun create @donilite/wrap my-app
cd my-app
bun run wake:db     # PostgreSQL + Redis (docker compose)
bun run push:db     # apply the schema
bun run dev         # http://localhost:5000/docs
bun test            # the app is born test-driven
```

## What you get

| Feature | Description |
| --- | --- |
| **Vertical slices** | entity + repository + service + controller + DTO per feature |
| **OOP entities** | `class X extends Entity(...)` — typed rows, zero column re-declaration |
| **Typed populate** | explicit `relations()`, `with: { posts: true }` autocompleted |
| **zod DTOs** | `SelectDTO`/`InsertDTO` derived from the table; validation, whitelist serialization and OpenAPI from the same schema |
| **Swagger** | generated from decorators + DTO schemas, exact `$ref`s |
| **Transactions** | `withTransaction(fn)` — implicit AsyncLocalStorage propagation |
| **Entity events** | `onEntityEvent(User, handler)` on every write, commit-aware |
| **Cache** | opt-in `cacheTtl` per repository, automatic invalidation, Redis backend on Bun's native client |
| **Realtime** | WebSocket channels on native Bun topics, Redis relay, entity events auto-published |
| **Testing** | `@donilite/wrap/testing` — in-process PGlite database, service/controller helpers |
| **Auth & middlewares** | `createAuth` (JWT + cookie sessions), role guards, rate limit, cache, secure headers |

## Packages

| Package | Description |
| --- | --- |
| [`@donilite/wrap`](packages/wrap) | the framework |
| [`@donilite/create-wrap`](packages/create-wrap) | project scaffolding (`bun create @donilite/wrap`) |

## Development (this monorepo)

```bash
bun install
bun run build       # tsc build of @donilite/wrap (dist ESM + d.ts)
bun run typecheck   # wrap + starter
bun run lint
cd packages/create-wrap/template && bun test
```

## Releases

Tag-driven: `git tag v0.x.y && git push origin v0.x.y` runs checks and publishes both packages via npm Trusted Publishing (OIDC — see `.github/workflows/release.yml`).

## License

MIT
