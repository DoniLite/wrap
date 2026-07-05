# @donilite/wrap

OOP backend framework on Hono + Drizzle — Bun-first, vertical-slice, decorator-driven. See the [repository README](https://github.com/DoniLite/wrap#readme) for the overview; this page is the module reference. Every exported class, function and option also carries JSDoc.

```bash
bun create @donilite/wrap my-app   # scaffold a ready-to-run project
# or add to an existing app:
bun add @donilite/wrap
```

Peer dependencies: `hono`, `drizzle-orm`, `drizzle-zod`, `zod`, `pg` (plus `@electric-sql/pglite` and `drizzle-kit` for the testing utilities).

Requires `experimentalDecorators` + `emitDecoratorMetadata` in the consumer tsconfig (the scaffold ships it).

## Registry — telling the framework about your app

Types flow from a single declaration-merging point:

```ts
// factory/web.factory.ts (scaffolded)
declare module "@donilite/wrap" {
  interface WrapRegistry {
    schema: typeof import("@/db");  // tables + relations → typed populate
    variables: Variables;           // Hono context variables
    roles: UserRoles;               // access-control roles
  }
}
```

## Entities — `Entity`, `relationsOf`, `BaseRow`

```ts
export class Example extends Entity("examples", {
  name: text("name").notNull(),
  categoryId: text("category_id").references(() => ExampleCategory.table.id),
}) {}

// Required named exports (drizzle-kit + populate typing):
export const ExampleTable = Example.table;
export const ExampleRelations = relationsOf(Example, ({ one, many, self }) => ({
  items: many(() => ExampleItem),
  category: one(() => ExampleCategory, { fields: [self.categoryId] }),
}));
```

- `BaseRow` columns (`id`, `createdAt`, `updatedAt`, `deletedAt`) are injected automatically.
- `InstanceType<typeof Example>` is the typed row — columns are never re-declared.
- Relation targets are lazy class thunks: cross-slice references never create import cycles.
- Declare relations through `relationsOf(entity, cb)` (the `relations` option of `Entity()` also exists, but mutual references inside `extends` clauses are a TS type cycle).

## Database — `initializeDatabase`, `getDatabase`, `setDatabase`, `closeDatabase`

```ts
initializeDatabase({ connectionString, schema, poolSize?, logger? });
```

Call once at bootstrap, before any controller/repository is instantiated (the scaffold does it in `src/bootstrap.ts`, first import of `src/index.ts`). `setDatabase(db)` injects a prebuilt drizzle instance (used by the testing utilities). Public types depending on the registry are explicitly annotated — keep it that way if you extend the framework.

## Repositories — `BaseRepository<Tb, TCreate?, TUpdate?>`

```ts
@Repository("ExampleRepository")
export class ExampleRepository extends BaseRepository<
  typeof Example.table,
  CreateExampleDTO,
  Partial<CreateExampleDTO>
> {
  protected table = Example.table;
  protected override relationalQuery = () => this.db.query.ExampleTable; // populate
  protected override defaultWith = { items: true, category: true } as const;
  protected override searchableFields: (keyof ExampleTableType)[] = ["name"];
  protected override cacheTtl = 30; // seconds — entity-scope cache
}
```

CRUD surface: `create`, `findById`, `findOne`, `findAll`, `findPaginated`, `findBy`, `findOneBy`, `update`, `delete`, `deleteMultiple`, `count`, `exists`, `getStatistics`.

- Read methods accept `{ with, includeDeleted }`; `with` is typed against your `relations()` and the result type includes the populated relations.
- Soft delete: rows with `deletedAt` set are excluded by default.
- `relationalQuery` is a **thunk** so the database is resolved at query time.
- `cacheTtl` opts into the entity-scope cache: reads go through the configured store, any write invalidates the scope (via entity events), transactional reads bypass it.

## Services & controllers — `BaseService<Repo>`, `BaseController<Service>`

```ts
@Service()
export class ExampleService extends BaseService<ExampleRepository> {}

@Controller({ basePath: "/api/examples", tags: ["Examples"] })
export class ExampleController extends BaseController<ExampleService> {
  @Get({ path: "/" })
  @ApiResponse(200, { description: "OK", schema: PaginatedResponseDTO(ExampleBase) })
  @Serialize(PaginatedResponseDTO(ExampleBase))
  async list(c: Context) { ... }
}
```

Route decorators: `@Get/@Post/@Put/@Patch/@Delete/@Route`, `@UseMiddleware`, `@Cache`, `@RateLimit`, `@Can(roles)`, `@ApiResponse`, `@Serialize`, `@ValidateDTO`. `handleError` and the global `errorHandler()` (register with `app.onError`) share one error contract; validation failures answer 400 with `{ property, constraints, value }` details.

## DTOs — zod-backed classes

```ts
export const ExampleBase = SelectDTO(Example, { exclude: ["deletedAt"] });
export class CreateExampleDTO extends InsertDTO(Example) {}   // id/timestamps excluded
export const UpdateExampleDTO = PartialDTO(CreateExampleDTO);
export class ContactDTO extends SchemaDTO(z.object({ email: z.email() })) {} // entity-free
```

`X.from(plain)` validates and strips unknown keys; `X.schema` is the single source for validation, whitelist serialization and OpenAPI (`z.toJSONSchema`). Refine with `static override schema = Parent.schema.extend({...})`.

## Transactions — `withTransaction`

```ts
await withTransaction(async () => {
  const user = await userRepository.create(dto);
  await profileRepository.create(ProfileDTO.from({ userId: user.id }));
}); // throw → rollback of the whole scope
```

Implicit AsyncLocalStorage propagation — no `tx` parameter. Nested calls join the ambient transaction. Entity events are buffered until commit.

## Entity events — `onEntityEvent`, `emitEntityEvent`

```ts
const off = onEntityEvent(Example, (event) => {
  // { type: "created" | "updated" | "deleted", table, data }
});
onEntityEvent("*", audit);
```

Emitted by every repository write; they power cache invalidation and realtime.

## Cache — `configureCache`, `CacheStore`, `RedisCacheStore`

```ts
configureCache({ store: new RedisCacheStore({ url: process.env.REDIS_URL }) });
```

In-memory by default. The store powers repository `cacheTtl`, the `@Cache` decorator and `cacheMiddleware`. `RedisCacheStore` uses Bun's native Redis client (zero dependency). Custom backends implement `CacheStore` (`get/set/delete/deletePrefix/clear`).

## Realtime — `@donilite/wrap/realtime` (Bun-only subpath)

```ts
const realtime = createRealtime({ redisUrl, authorize? });
app.get("/realtime", realtime.upgrade);
realtime.bindEntityEvents(); // auto-publish writes on entity:<table>
const server = Bun.serve({ fetch: app.fetch, websocket: realtime.websocket, port });
realtime.attach(server);
```

Fan-out uses native Bun WebSocket topics; the optional Redis pub/sub relay (single `wrap:rt:relay` channel) synchronizes instances. Client protocol: `{ action: "subscribe" | "unsubscribe", channel }` → `{ type: "subscribed" | "message" | "error", ... }`.

## Auth — `createAuth`

```ts
export const auth = createAuth({ secret, secureCookies: prod });
app.use("/admin/*", auth.authMiddleware);
export const adminOnly = auth.requireRoles(WRITE_ACCESS);
```

JWT (HS256 by default) + refreshed cookie session; `setupCookieSession`/`clearCookieSession` for login/logout flows.

## Testing — `@donilite/wrap/testing`

```ts
const testDb = await createTestDatabase({ schema }); // in-process PGlite, no docker
await testDb.truncateAll();                          // between tests (also clears cache)
service.create(dto, testContext({ json: body }));    // minimal Hono context
await requestJson(controller.getApp(), "POST", "/", body);
```

Pass `url` to run against a real Postgres for integration tests.

## Also exported

`ResponseHelper`, `buildQuery` (HTTP query → `PaginationQuery`), `ValidatorHelper`, hash/image/date helpers, `BaseSeeder`/`SeederRunner`, `ServiceFactory`, storage providers (`configureStorage`, `LocalStorageProvider`), `setupSwagger`, `logger`/`Logger`, rate-limit/cache/request-logger middlewares.
