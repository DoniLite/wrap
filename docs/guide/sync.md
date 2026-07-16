---
title: Offline-first sync
parent: Guides
nav_order: 3
---

`BaseRepository` ships two methods for a client (typically mobile) that stores data locally and syncs to the backend without going through the database layer directly: cursor-based **pull** and batch **push**, both built on the `BaseRow` columns (`updatedAt`, `deletedAt`) every entity already has.

## Pull: `findChangedSince`

```ts
const page = await repository.findChangedSince(cursor, { limit: 200 });
// { items: [...], nextCursor: string | null }
```

Rows with `updatedAt` greater than `cursor` (exclusive), oldest first, capped at `limit` (default 200). `nextCursor` is the last item's `updatedAt` when the page is full (more to fetch), `null` when caught up — pass it back as the next call's `cursor`. **Soft-deleted rows are included as tombstones**: `deletedAt` updates bump `updatedAt` too (via Drizzle's `$onUpdate` on that column), so a client sees them in the normal pull and knows to delete locally. Not filtered by the usual soft-delete exclusion — sync needs tombstones, regular reads don't. An invalid cursor (fails to parse as a date) throws immediately rather than silently matching everything or nothing.

## Push: `applyBatch`

```ts
const result = await repository.applyBatch([
  { op: "create", data: { name: "..." }, updatedAt: new Date().toISOString() },
  { op: "update", id: "...", data: { name: "..." }, updatedAt: "..." },
  { op: "delete", id: "...", updatedAt: "..." },
]);
// { applied: [...ids], conflicts: [{ id, serverUpdatedAt }] }
```

**Conflict resolution is last-write-wins on `updatedAt`.** For each `update`/`delete`, the server's current row is compared: if the server's `updatedAt` is *newer* than the client's change, the change is reported back as a conflict and skipped — not applied, not merged. `create` never conflicts. **Deletes are soft** (`applyBatch`'s `"delete"` sets `deletedAt`, it does not call the repository's hard `delete()`) specifically so they surface as tombstones through a subsequent `findChangedSince`.

**The whole batch is atomic** — `applyBatch` runs inside `withTransaction()`, so an error partway through (a constraint violation on change N, say) rolls back every change already applied in that call. Conflicts don't throw, so they still land in the same commit as whatever else in the batch succeeded.

## Exposing it over HTTP

Not automatic — a controller opts in explicitly (not every entity needs to be sync-exposed to a client):

```ts
@Get({ path: "/sync" })
async pull(c: Context) {
  const cursor = c.req.query("since") ?? new Date(0).toISOString();
  return c.json(await this.service.findChangedSince(cursor));
}

@Post({ path: "/sync" })
async push(c: Context) {
  const changes = await c.req.json();
  return c.json(await this.service.applyBatch(changes));
}
```

`BaseService` forwards both (`service.findChangedSince(...)`/`service.applyBatch(...)`), same pattern as `findById`/`findAll`.

## Types

```ts
interface SyncChange<TCreate, TUpdate> {
  op: "create" | "update" | "delete";
  id?: string | number;          // required for update/delete
  data?: TCreate | TUpdate;       // required for create/update
  updatedAt: string | Date;       // client-side timestamp, drives conflict resolution
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

Full method signatures: [Repositories — offline sync](../api/repositories.md#offline-first-sync).
