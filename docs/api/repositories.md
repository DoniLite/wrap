---
title: Repositories
parent: API reference
nav_order: 4
---

`packages/wrap/src/base.repository.ts`. See also: [Offline-first sync guide](../guide/sync.md).

## `BaseRepository<Tb, TCreate?, TUpdate?>` (abstract)

```ts
abstract class BaseRepository<
  Tb extends BaseTable,
  TCreate extends PgInsertValue<Tb> = InferCreate<Tb>,
  TUpdate extends PgUpdateSetSource<Tb> = InferUpdate<Tb>,
> {
  protected abstract table: Tb;
  protected logger: Logger;
  protected get db(): WrapDatabase; // lazy — resolves ambient transaction, then getDatabase()

  // Populate support (optional):
  protected relationalQuery?: () => RelationalQueryLike;
  protected defaultWith?: NonNullable<WithConfig<Tb>>;

  // findPaginated's default search columns (optional):
  protected searchableFields?: Array<keyof Tb["_"]["columns"] & string>;

  // Entity-scope caching (optional):
  protected cacheTtl?: number;
}
```

The Drizzle table is the single source of truth — entity, create, and update shapes are all inferred from it (`InferEntity`/`InferCreate`/`InferUpdate`, `types/base.ts`). `Tb` must include `BaseRow`'s columns (`id`, `createdAt`, `updatedAt`, `deletedAt`) — every table built via `Entity(...)` (see [Entity](entity.md)) already does.

```ts
@Repository("FooRepository")
class FooRepository extends BaseRepository<typeof Foo.table, CreateFooDTO, Partial<CreateFooDTO>> {
  protected table = Foo.table;
  protected override relationalQuery = () => this.db.query.FooTable; // enables `with`
  protected override defaultWith = { items: true } as const;          // populateChildren=true default
  protected override searchableFields = ["name", "description"] as const;
  protected override cacheTtl = 30; // seconds — opt into entity-scope caching
}
```

## CRUD methods

| Method | Signature | Notes |
|---|---|---|
| `create` | `create(dto: TCreate): Promise<InferEntity<Tb>>` | Emits an `"created"` entity event. |
| `findById` | `findById<W>(id, options?: FindOptions<Tb, W>): Promise<FindResult<Tb, W> \| null>` | Excludes soft-deleted rows unless `options.includeDeleted`. Populates via `options.with` when given. Cached if `cacheTtl` is set. |
| `findPaginated` | `findPaginated<W>(query: PaginationQuery, options?): Promise<PaginatedResponse<FindResult<Tb, W>>>` | See "Pagination query" below. |
| `findAll` | `findAll<W>(filters?, options?): Promise<FindResult<Tb, W>[]>` | `filters` becomes `AND`-ed equality conditions; array values become `IN`. |
| `findOne` | `findOne<W>(filters?, options?): Promise<FindResult<Tb, W> \| null>` | — |
| `update` | `update(id, dto: TUpdate): Promise<InferEntity<Tb>[] \| null>` | `null` if no row matched. Emits `"updated"`. |
| `delete` | `delete(id): Promise<boolean>` | **Hard delete** (`DELETE FROM`). Emits `"deleted"` if a row was actually removed. For a sync-friendly soft delete, use `applyBatch([{ op: "delete", ... }])` instead — see [sync](#offline-first-sync). |
| `deleteMultiple` | `deleteMultiple(ids): Promise<number>` | Returns the count actually deleted; emits one `"deleted"` event with all `ids`. |
| `findBy` | `findBy<K>(field: K, value): Promise<InferEntity<Tb>[]>` | — |
| `findOneBy` | `findOneBy<K>(field: K, value): Promise<InferEntity<Tb> \| null>` | — |
| `count` | `count(filters?): Promise<number>` | — |
| `exists` | `exists(id): Promise<boolean>` | `findById(id) !== null`. |
| `getStatistics` | `getStatistics(): Promise<EntityStatistics>` | Monthly/weekly/yearly counts vs. the prior period, based on `createdAt`. |

```ts
interface FindOptions<Tb, W> {
  with?: W;               // typed against the table's relations() config
  includeDeleted?: boolean;
}
```

### Pagination query

```ts
interface PaginationQuery {
  page?: number;              // default 1
  pageSize?: number;          // default 10
  search?: string;             // matched against searchableFields with ILIKE, space-split terms OR'd
  sortBy?: string;              // default "id"; falls back to "id" if the column doesn't exist
  sortOrder?: SortOrder;         // "asc" | "desc", default "asc"
  includeDeleted?: boolean;
  populateChildren?: boolean;    // uses defaultWith if no explicit `with` is given
  filters?: Record<string, string | number | boolean | string[] | undefined>;
}
interface PaginatedResponse<T> {
  items: T[]; itemCount: number; page: number; pageSize: number; pageCount: number;
}
```

Build one from raw query-string params with `buildQuery()` — see [Helpers](helpers.md#buildqueryquery).

## Offline-first sync

Full explanation: [Sync guide](../guide/sync.md).

```ts
async findChangedSince(
  cursor: Date | string,
  options?: { limit?: number }, // default 200
): Promise<SyncPage<InferEntity<Tb>>>

async applyBatch(
  changes: Array<SyncChange<TCreate, TUpdate>>,
): Promise<SyncBatchResult>
```

```ts
interface SyncChange<TCreate, TUpdate> {
  op: "create" | "update" | "delete";
  id?: string | number;          // required for update/delete
  data?: TCreate | TUpdate;
  updatedAt: string | Date;       // drives last-write-wins conflict resolution
}
interface SyncBatchResult {
  applied: Array<string | number>;
  conflicts: Array<{ id: string | number; serverUpdatedAt: string }>;
}
interface SyncPage<T> {
  items: T[];
  nextCursor: string | null;
}
```

`applyBatch` runs the whole batch inside `withTransaction()` — atomic; throws immediately on an invalid `updatedAt`/cursor.

## Caching

Set `protected override cacheTtl = <seconds>` to opt a repository into entity-scope read caching (`findById`/`findAll`/`findOne`/`findPaginated`). Any write on the entity invalidates the whole cache scope automatically via entity events — see [Helpers — cache](helpers.md#cache-middleware--stores). Reads inside an active `withTransaction()` bypass the cache.

## Populate (`with`)

Requires two things on the repository: `protected relationalQuery = () => this.db.query.<TableName>;` (a thunk — resolved at call time, never captured at construction, since the database might not be initialized yet when the repository class is first loaded) and the table's `relations()` declared via `relationsOf()` in the entity module (see [Entity](entity.md#relationsofentity-config)). Calling a populate-requiring read without `relationalQuery` set throws a descriptive error.

## Internals (protected, available to override)

| Member | Purpose |
|---|---|
| `column(name)` | Look up a `PgColumn` by name on the table, or `undefined`. |
| `db` (getter) | `currentTransaction() ?? getDatabase()` — the ambient transaction if one is active, else the app's default connection. |

## Type helpers

```ts
type RelationalQueryLike // structural shape of `db.query.<Table>` (findMany/findFirst)
type RepositoryTable<R>  // R's Tb
```

Statistics types: `StatisticsPeriod`, `StatisticsComparison`, `EntityStatistics` (all exported from this module).
