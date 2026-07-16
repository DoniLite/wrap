---
title: Services
parent: API reference
nav_order: 3
---

`packages/wrap/src/base.service.ts`.

## `WrapService` (abstract)

```ts
abstract class WrapService {
  protected logger: Logger;
}
```

Base for any service with **no repository attached** — orchestration, sync coordination, email, an external-API-calling service, anything that isn't entity-CRUD-based. Follows the same `@Service()` + `@ValidateDTO()` convention as an entity-backed service:

```ts
@Service()
class NotificationService extends WrapService {
  @ValidateDTO()
  async send(dto: SendNotificationDTO, c: Context) {
    this.logger.debug("Sending notification", { to: dto.to });
    // ...
  }
}
```

## `BaseService<Repo, TCreate?, TUpdate?>` (abstract, extends `WrapService`)

```ts
abstract class BaseService<
  Repo extends BaseRepository<any, any, any>,
  TCreate = RepositoryCreate<Repo>,
  TUpdate = RepositoryUpdate<Repo>,
> extends WrapService {
  constructor(protected repository: Repo);
}
```

Generic CRUD service — everything is derived from the repository type: `class FooService extends BaseService<FooRepository> {}`. `TCreate`/`TUpdate` default to the repository's own inferred create/update shapes; override either generic to narrow them for the service layer specifically.

### Methods

| Method | Signature | Notes |
|---|---|---|
| `create` | `@ValidateDTO() create(dto: TCreate, c: Context): Promise<RepositoryEntity<Repo>>` | Validates `dto` against its DTO schema (found via the paramtype or an instance already matching a registered DTO class) before calling `repository.create()`. |
| `findById` | `findById(id, options?: ServiceFindOptions<Repo>): Promise<RepositoryEntity<Repo> \| null>` | — |
| `findAll` | `findAll(filters?, options?): Promise<RepositoryEntity<Repo>[]>` | — |
| `findPaginated` | `findPaginated(query: PaginationQuery, options?): Promise<PaginatedResponse<RepositoryEntity<Repo>>>` | — |
| `update` | `@ValidateDTO() update(id, dto: TUpdate, c: Context): Promise<RepositoryEntity<Repo>[] \| null>` | Throws `Error("Entity with id ${id} not found")` if `repository.exists(id)` is false — caught by the standard error mapping as a 404 (message contains "not found"). |
| `delete` | `delete(id): Promise<boolean>` | Same existence check/throw as `update`. |
| `deleteMultiple` | `deleteMultiple(ids): Promise<{ deletedCount, requestedCount, success }>` | `success` is `deletedCount === requestedCount`. |
| `findBy` | `findBy<K>(field: K, value): Promise<RepositoryEntity<Repo>[]>` | — |
| `findOneBy` | `findOneBy<K>(field: K, value): Promise<RepositoryEntity<Repo> \| null>` | — |
| `findOne` | `findOne(filters?, options?): Promise<RepositoryEntity<Repo> \| null>` | — |
| `count` | `count(filters?): Promise<number>` | — |
| `exists` | `exists(id): Promise<boolean>` | — |
| `findChangedSince` | `findChangedSince(cursor, options?): Promise<SyncPage<RepositoryEntity<Repo>>>` | Forwards to the repository — see [offline sync](repositories.md#offline-first-sync). |
| `applyBatch` | `applyBatch(changes): Promise<SyncBatchResult>` | Forwards to the repository. |
| `getStatistics` | `getStatistics(): Promise<EntityStatistics>` | Forwards to the repository. |

```ts
interface ServiceFindOptions<Repo> {
  with?: RepositoryWith<Repo>;     // typed populate config, derived from the repository
  includeDeleted?: boolean;
}
```

Every read method's `options?.with` is fully typed against the repository's registered relations. For a fully-typed populate result beyond what `ServiceFindOptions` exposes, call the repository directly.

### Type helpers (from `base.repository.ts`, re-exported through the barrel)

```ts
type RepositoryEntity<R>  // R's InferEntity<Table>
type RepositoryCreate<R>  // R's TCreate
type RepositoryUpdate<R>  // R's TUpdate
type RepositoryWith<R>    // R's WithConfig<Table>
```
