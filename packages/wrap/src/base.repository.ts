import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  getTableName,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import type {
  PgColumn,
  PgInsertValue,
  PgTable,
  PgUpdateSetSource,
} from "drizzle-orm/pg-core";
import { getDatabase, type WrapDatabase } from "./database";
import { currentTransaction, withTransaction } from "./transaction";
import { emitEntityEvent } from "./events";
import {
  entityCachePrefix,
  getCacheStore,
} from "./middleware/cache.middleware";
import type {
  BaseTable,
  FindOptions,
  FindResult,
  InferCreate,
  InferEntity,
  InferUpdate,
  WithConfig,
} from "./types/base";
import type {
  PaginatedResponse,
  PaginationQuery,
} from "./types/pagination";
import { SortOrder } from "./types/pagination";
import { logger } from "./logger";

export interface StatisticsPeriod {
  count: number;
  period: string;
  percentage?: number;
}

export interface StatisticsComparison {
  current: StatisticsPeriod;
  previous: StatisticsPeriod;
  growth: number;
  growthPercentage: number;
}

export interface EntityStatistics {
  monthly: StatisticsComparison;
  weekly: StatisticsComparison;
  yearly: StatisticsComparison;
}

/** A single offline-first change to apply via `BaseRepository.applyBatch`. */
export interface SyncChange<TCreate, TUpdate> {
  op: "create" | "update" | "delete";
  /** Required for "update" and "delete"; ignored for "create". */
  id?: string | number;
  /** Row payload for "create"/"update"; ignored for "delete". */
  data?: TCreate | TUpdate;
  /** Client-side timestamp of this change, used for last-write-wins conflict resolution. */
  updatedAt: string | Date;
}

export interface SyncBatchResult {
  applied: Array<string | number>;
  conflicts: Array<{ id: string | number; serverUpdatedAt: string }>;
}

export interface SyncPage<T> {
  items: T[];
  /** Pass back as `cursor` to fetch the next page; null once caught up. */
  nextCursor: string | null;
}

/**
 * Minimal structural view of a Drizzle relational query builder
 * (`db.query.<Table>`). Repositories that support populate assign theirs
 * to `relationalQuery`.
 */
export interface RelationalQueryLike {
  findMany(config?: {
    where?: SQL;
    orderBy?: SQL | SQL[];
    limit?: number;
    offset?: number;
    with?: Record<string, unknown>;
  }): Promise<Record<string, unknown>[]>;
  findFirst(config?: {
    where?: SQL;
    orderBy?: SQL | SQL[];
    with?: Record<string, unknown>;
  }): Promise<Record<string, unknown> | undefined>;
}

// ===== Types derived from a repository (used by BaseService) =====

/* eslint-disable @typescript-eslint/no-explicit-any */
export type RepositoryTable<R> =
  R extends BaseRepository<infer Tb, any, any> ? Tb : never;
export type RepositoryEntity<R> = InferEntity<RepositoryTable<R>>;
export type RepositoryCreate<R> =
  R extends BaseRepository<any, infer C, any> ? C : never;
export type RepositoryUpdate<R> =
  R extends BaseRepository<any, any, infer U> ? U : never;
export type RepositoryWith<R> =
  R extends BaseRepository<infer Tb, any, any> ? WithConfig<Tb> : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

const DEFAULT_SEARCHABLE_FIELDS = [
  "name",
  "title",
  "description",
  "email",
  "username",
];

/**
 * Affected-row count across pg drivers (node-postgres: rowCount,
 * PGlite: affectedRows). Undefined when the driver reports nothing.
 */
function extractAffectedRows(result: unknown): number | undefined {
  if (result && typeof result === "object") {
    const r = result as { rowCount?: number | null; affectedRows?: number };
    return r.rowCount ?? r.affectedRows ?? undefined;
  }
  return undefined;
}

/**
 * Generic CRUD repository. The Drizzle table is the single source of truth:
 * entity, create and update shapes are inferred from it.
 *
 * Satisfies the `CrudOperations` contract (types/base.ts) — the clause is
 * not declared because checking it against the open WrapRegistry makes TS
 * hit its instantiation-depth limit when no schema is registered.
 *
 * @template Tb - The Drizzle table (must include BaseRow columns)
 * @template TCreate - Optional narrower create DTO (defaults to the insert model)
 * @template TUpdate - Optional narrower update DTO (defaults to the update model)
 */
export abstract class BaseRepository<
  Tb extends BaseTable,
  TCreate extends PgInsertValue<Tb> = InferCreate<Tb>,
  TUpdate extends PgUpdateSetSource<Tb> = InferUpdate<Tb>,
> {
  protected abstract table: Tb;
  protected logger = logger;

  /**
   * Lazy database access — resolved on first use so repositories can be
   * declared before `initializeDatabase()` runs at bootstrap. When a
   * `withTransaction` scope is active, the ambient transaction is used
   * transparently.
   * (Return type MUST stay explicit: without it tsc freezes the inferred
   * registry conditional into the emitted d.ts.)
   */
  protected get db(): WrapDatabase {
    return currentTransaction() ?? getDatabase();
  }

  /**
   * Relational query accessor for this table, as a thunk so the database
   * is resolved at call time (never captured at construction):
   * `protected relationalQuery = () => this.db.query.ExampleTable;`
   * Required for populate (`with`) support — relations must also be
   * declared with `relations()` in the schema.
   */
  protected relationalQuery?: () => RelationalQueryLike;

  /**
   * Relations loaded when an HTTP request sets `populateChildren=true`,
   * e.g. `protected defaultWith = { items: true };`
   */
  protected defaultWith?: NonNullable<WithConfig<Tb>>;

  /**
   * Columns targeted by `findPaginated`'s `search` param. Override per
   * repository; defaults to common text fields present on the table.
   */
  protected searchableFields?: Array<keyof Tb["_"]["columns"] & string>;

  /**
   * Opt-in entity-scope caching: set a TTL (seconds) and every read of
   * this repository goes through the configured cache store; any write
   * on the entity invalidates the whole scope automatically (entity
   * events). Reads inside a transaction bypass the cache.
   * `protected override cacheTtl = 60;`
   */
  protected cacheTtl?: number;

  private async cached<T>(
    method: string,
    args: unknown[],
    fetch: () => Promise<T>,
  ): Promise<T> {
    const ttl = this.cacheTtl;
    if (!ttl || currentTransaction()) return fetch();

    const key = `${entityCachePrefix(getTableName(this.table))}${method}:${JSON.stringify(args)}`;
    const store = getCacheStore();

    try {
      const hit = await store.get(key);
      if (hit !== null && hit !== undefined) return hit as T;
    } catch {
      // cache is best-effort
    }

    const result = await fetch();
    if (result !== null && result !== undefined) {
      try {
        await store.set(key, result, ttl);
      } catch {
        // cache is best-effort
      }
    }
    return result;
  }

  async create(dto: TCreate): Promise<InferEntity<Tb>> {
    this.logger.debug("Creating entity in DB", {
      table: getTableName(this.table),
    });
    const [result] = await this.db.insert(this.table).values(dto).returning();
    const entity = result as InferEntity<Tb>;
    emitEntityEvent({
      type: "created",
      table: getTableName(this.table),
      data: entity,
    });
    return entity;
  }

  async findById<W extends WithConfig<Tb> | undefined = undefined>(
    id: string | number,
    options?: FindOptions<Tb, W>,
  ): Promise<FindResult<Tb, W> | null> {
    return this.cached("findById", [id, options], async () => {
      const where = this.combine([
        eq(this.table.id, id),
        this.softDeleteFilter(options?.includeDeleted),
      ]);

      const withConfig = this.resolveWith(options?.with);
      if (withConfig) {
        const result = await this.requireRelationalQuery().findFirst({
          where,
          with: withConfig,
        });
        return (result ?? null) as FindResult<Tb, W> | null;
      }

      const [result] = await this.db
        .select()
        .from(this.table as PgTable)
        .where(where)
        .limit(1);
      return (result ?? null) as FindResult<Tb, W> | null;
    });
  }

  async findPaginated<W extends WithConfig<Tb> | undefined = undefined>(
    paginationQuery: PaginationQuery,
    options?: FindOptions<Tb, W>,
  ): Promise<PaginatedResponse<FindResult<Tb, W>>> {
    return this.cached("findPaginated", [paginationQuery, options], () =>
      this.fetchPaginated(paginationQuery, options),
    ) as Promise<PaginatedResponse<FindResult<Tb, W>>>;
  }

  private async fetchPaginated(
    paginationQuery: PaginationQuery,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options?: FindOptions<Tb, any>,
  ): Promise<PaginatedResponse<unknown>> {
    const {
      page = 1,
      pageSize = 10,
      search,
      sortBy = "id",
      sortOrder = SortOrder.ASC,
      populateChildren = false,
      includeDeleted = false,
      filters = {},
    } = paginationQuery;

    const validPage = Math.max(1, page);
    const validPageSize = Math.max(1, pageSize);
    const offset = (validPage - 1) * validPageSize;

    const conditions: SQL[] = [];

    // Filters (arrays become IN clauses)
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined) continue;
      const column = this.column(key);
      if (!column) {
        this.logger.warn(`Ignoring filter on unknown column "${key}"`, {
          table: getTableName(this.table),
        });
        continue;
      }
      conditions.push(
        Array.isArray(value) ? inArray(column, value) : eq(column, value),
      );
    }

    // Full-text-ish search on configured columns
    if (search?.trim()) {
      const terms = search.trim().split(" ").filter(Boolean);
      const columns = this.resolveSearchableColumns();
      const searchConditions = terms.flatMap((term) =>
        columns.map((column) => ilike(column, `%${term}%`)),
      );
      const combined = or(...searchConditions);
      if (searchConditions.length > 0 && combined) {
        conditions.push(combined);
      }
    }

    const softDelete = this.softDeleteFilter(
      includeDeleted || options?.includeDeleted,
    );
    if (softDelete) conditions.push(softDelete);

    const where = this.combine(conditions);

    // Total count (single COUNT query, no row loading)
    const itemCount = await this.countWhere(where);

    const sortColumn = this.column(sortBy) ?? this.table.id;
    const orderBy =
      sortOrder === SortOrder.DESC ? desc(sortColumn) : asc(sortColumn);

    const withConfig = this.resolveWith(options?.with, populateChildren);
    let items: unknown[];
    if (withConfig) {
      items = await this.requireRelationalQuery().findMany({
        where,
        orderBy,
        limit: validPageSize,
        offset,
        with: withConfig,
      });
    } else {
      items = await this.db
        .select()
        .from(this.table as PgTable)
        .where(where)
        .orderBy(orderBy)
        .limit(validPageSize)
        .offset(offset);
    }

    return {
      items,
      itemCount,
      page: validPage,
      pageSize: validPageSize,
      pageCount: Math.ceil(itemCount / validPageSize),
    };
  }

  async findAll<W extends WithConfig<Tb> | undefined = undefined>(
    filters?: Partial<InferEntity<Tb>>,
    options?: FindOptions<Tb, W>,
  ): Promise<FindResult<Tb, W>[]> {
    return this.cached("findAll", [filters, options], async () => {
      const conditions = this.buildEqConditions(filters);
      const softDelete = this.softDeleteFilter(options?.includeDeleted);
      if (softDelete) conditions.push(softDelete);
      const where = this.combine(conditions);

      const withConfig = this.resolveWith(options?.with);
      if (withConfig) {
        return (await this.requireRelationalQuery().findMany({
          where,
          with: withConfig,
        })) as FindResult<Tb, W>[];
      }

      return (await this.db
        .select()
        .from(this.table as PgTable)
        .where(where)) as FindResult<Tb, W>[];
    });
  }

  async findOne<W extends WithConfig<Tb> | undefined = undefined>(
    filters?: Partial<InferEntity<Tb>>,
    options?: FindOptions<Tb, W>,
  ): Promise<FindResult<Tb, W> | null> {
    return this.cached("findOne", [filters, options], async () => {
      const conditions = this.buildEqConditions(filters);
      const softDelete = this.softDeleteFilter(options?.includeDeleted);
      if (softDelete) conditions.push(softDelete);
      const where = this.combine(conditions);

      const withConfig = this.resolveWith(options?.with);
      if (withConfig) {
        const result = await this.requireRelationalQuery().findFirst({
          where,
          with: withConfig,
        });
        return (result ?? null) as FindResult<Tb, W> | null;
      }

      const [result] = await this.db
        .select()
        .from(this.table as PgTable)
        .where(where)
        .limit(1);
      return (result ?? null) as FindResult<Tb, W> | null;
    });
  }

  async update(
    id: string | number,
    dto: TUpdate,
  ): Promise<InferEntity<Tb>[] | null> {
    this.logger.debug(`Updating entity ${id} in DB`, {
      table: getTableName(this.table),
      id,
    });
    const result = (await this.db
      .update(this.table)
      .set(dto)
      .where(eq(this.table.id, id))
      .returning()) as InferEntity<Tb>[];

    if (!result || result.length === 0) return null;
    emitEntityEvent({
      type: "updated",
      table: getTableName(this.table),
      data: result,
    });
    return result;
  }

  async delete(id: string | number): Promise<boolean> {
    try {
      const result = await this.db
        .delete(this.table)
        .where(eq(this.table.id, id));
      const affected = extractAffectedRows(result);
      const deleted = affected === undefined ? true : affected > 0;
      if (deleted) {
        emitEntityEvent({
          type: "deleted",
          table: getTableName(this.table),
          data: { ids: [id] },
        });
      }
      return deleted;
    } catch (error) {
      this.logger.error(
        `Failed to delete entity ${id} from ${getTableName(this.table)}`,
        {
          className: this.constructor.name,
          method: "delete",
          id,
        },
        error,
      );
      throw error;
    }
  }

  /**
   * Delete multiple entities by their IDs
   * @param ids - Array of entity IDs to delete
   * @returns Number of deleted entities
   */
  async deleteMultiple(ids: (string | number)[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const result = await this.db
      .delete(this.table)
      .where(inArray(this.table.id, ids));

    const affected = extractAffectedRows(result) ?? 0;
    if (affected > 0) {
      emitEntityEvent({
        type: "deleted",
        table: getTableName(this.table),
        data: { ids },
      });
    }
    return affected;
  }

  async findBy<K extends keyof InferEntity<Tb> & string>(
    field: K,
    value: InferEntity<Tb>[K],
  ): Promise<InferEntity<Tb>[]> {
    const rows = await this.db
      .select()
      .from(this.table as PgTable)
      .where(eq(this.requireColumn(field), value));
    return rows as InferEntity<Tb>[];
  }

  async findOneBy<K extends keyof InferEntity<Tb> & string>(
    field: K,
    value: InferEntity<Tb>[K],
  ): Promise<InferEntity<Tb> | null> {
    const [result] = await this.db
      .select()
      .from(this.table as PgTable)
      .where(eq(this.requireColumn(field), value))
      .limit(1);
    return (result as InferEntity<Tb>) ?? null;
  }

  async count(filters?: Partial<InferEntity<Tb>>): Promise<number> {
    return this.countWhere(this.combine(this.buildEqConditions(filters)));
  }

  async exists(id: string | number): Promise<boolean> {
    const result = await this.findById(id);
    return result !== null;
  }

  // ===== Offline-first sync (pull by cursor / push a batch) =====

  /**
   * Pull rows changed since `cursor` (exclusive), ordered oldest-first.
   * Soft-deleted rows are included as tombstones (their `deletedAt` bumps
   * `updatedAt` automatically — see `BaseRow`) so a client can delete them
   * locally. Not filtered by `softDeleteFilter`: sync needs tombstones,
   * regular reads don't.
   */
  async findChangedSince(
    cursor: Date | string,
    options?: { limit?: number },
  ): Promise<SyncPage<InferEntity<Tb>>> {
    const updatedAtColumn = this.requireColumn("updatedAt");
    const cursorDate = typeof cursor === "string" ? new Date(cursor) : cursor;
    if (Number.isNaN(cursorDate.getTime())) {
      throw new Error(`findChangedSince: invalid cursor "${String(cursor)}"`);
    }
    const limit = options?.limit ?? 200;

    const rows = (await this.db
      .select()
      .from(this.table as PgTable)
      .where(gt(updatedAtColumn, cursorDate))
      .orderBy(asc(updatedAtColumn))
      .limit(limit)) as InferEntity<Tb>[];

    const last = rows.at(-1) as { updatedAt: Date | string | null } | undefined;
    const nextCursor =
      rows.length === limit && last?.updatedAt
        ? new Date(last.updatedAt).toISOString()
        : null;

    return { items: rows, nextCursor };
  }

  /**
   * Push a batch of offline-made changes. Conflict resolution is
   * last-write-wins on `updatedAt`: if the server's row was touched more
   * recently than the client's change, the change is reported back as a
   * conflict and skipped rather than applied. Deletes are soft (set
   * `deletedAt`) so they surface as tombstones through `findChangedSince`
   * — this bypasses the repository's hard `delete()`.
   */
  async applyBatch(
    changes: Array<SyncChange<TCreate, TUpdate>>,
  ): Promise<SyncBatchResult> {
    // Atomic: a thrown error partway through (e.g. a constraint violation
    // on change N) rolls back every change already applied in this batch,
    // rather than leaving the server in a partially-applied state.
    // Conflicts don't throw, so they still land inside the same commit.
    return withTransaction(async () => {
      const applied: Array<string | number> = [];
      const conflicts: SyncBatchResult["conflicts"] = [];

      for (const change of changes) {
        const clientUpdatedAt =
          typeof change.updatedAt === "string"
            ? new Date(change.updatedAt)
            : change.updatedAt;

        if (Number.isNaN(clientUpdatedAt.getTime())) {
          throw new Error(
            `applyBatch: invalid updatedAt "${String(change.updatedAt)}" for change ${change.id ?? "(create)"}`,
          );
        }

        if (change.op === "create") {
          const created = await this.create(change.data as TCreate);
          applied.push((created as { id: string | number }).id);
          continue;
        }

        if (change.id === undefined) {
          throw new Error(`applyBatch: "${change.op}" requires an id`);
        }

        const existing = (await this.findById(change.id, {
          includeDeleted: true,
        })) as { updatedAt: Date | null } | null;

        if (existing?.updatedAt && existing.updatedAt > clientUpdatedAt) {
          conflicts.push({
            id: change.id,
            serverUpdatedAt: existing.updatedAt.toISOString(),
          });
          continue;
        }

        const setValues =
          change.op === "delete"
            ? { deletedAt: new Date() }
            : (change.data as Record<string, unknown>);

        await this.db
          .update(this.table)
          .set(setValues as PgUpdateSetSource<Tb>)
          .where(eq(this.table.id, change.id));

        emitEntityEvent({
          type: change.op === "delete" ? "deleted" : "updated",
          table: getTableName(this.table),
          data: { id: change.id },
        });

        applied.push(change.id);
      }

      return { applied, conflicts };
    });
  }

  // ===== Internals =====

  /** Access a column of the table by name, or undefined if it doesn't exist. */
  protected column(name: string): PgColumn | undefined {
    const columns = getTableColumns(this.table) as Record<
      string,
      PgColumn | undefined
    >;
    return columns[name];
  }

  private requireColumn(name: string): PgColumn {
    const column = this.column(name);
    if (!column) {
      throw new Error(
        `Column "${name}" does not exist on table "${getTableName(this.table)}"`,
      );
    }
    return column;
  }

  private combine(conditions: (SQL | undefined)[]): SQL | undefined {
    const defined = conditions.filter((c): c is SQL => c !== undefined);
    return defined.length > 0 ? and(...defined) : undefined;
  }

  private buildEqConditions(filters?: Partial<InferEntity<Tb>>): SQL[] {
    if (!filters) return [];
    const out: SQL[] = [];
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined) continue;
      const column = this.column(key);
      if (!column) continue;
      out.push(Array.isArray(value) ? inArray(column, value) : eq(column, value));
    }
    return out;
  }

  /** Exclude soft-deleted rows unless explicitly requested. */
  private softDeleteFilter(includeDeleted?: boolean): SQL | undefined {
    if (includeDeleted) return undefined;
    const deletedAt = this.column("deletedAt");
    return deletedAt ? isNull(deletedAt) : undefined;
  }

  /**
   * Resolve the `with` config to use: an explicit one wins, otherwise the
   * repository's `defaultWith` when `populateChildren` was requested.
   */
  private resolveWith(
    explicit?: Record<string, unknown>,
    populateChildren?: boolean,
  ): Record<string, unknown> | undefined {
    if (explicit && Object.keys(explicit).length > 0) return explicit;
    if (populateChildren) {
      if (!this.defaultWith) {
        this.logger.warn(
          `populateChildren requested but ${this.constructor.name} has no defaultWith configured`,
          { table: getTableName(this.table) },
        );
        return undefined;
      }
      return this.defaultWith;
    }
    return undefined;
  }

  private requireRelationalQuery(): RelationalQueryLike {
    if (!this.relationalQuery) {
      throw new Error(
        `${this.constructor.name} uses populate but does not define 'relationalQuery'. ` +
          `Set \`protected relationalQuery = () => this.db.query.<YourTable>;\` ` +
          `and declare the relations with relations() in the schema.`,
      );
    }
    return this.relationalQuery();
  }

  private resolveSearchableColumns(): PgColumn[] {
    const names: string[] = this.searchableFields ?? DEFAULT_SEARCHABLE_FIELDS;
    return names
      .map((name) => this.column(name))
      .filter((column): column is PgColumn => column !== undefined);
  }

  private async countWhere(where: SQL | undefined): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(this.table as PgTable)
      .where(where);
    return row?.value ?? 0;
  }

  /**
   * Get statistics for entities based on creation date
   * @returns EntityStatistics with monthly, weekly, and yearly comparisons
   */
  async getStatistics(): Promise<EntityStatistics> {
    const now = new Date();

    // Monthly statistics
    const monthly = await this.getPeriodStatistics(
      this.getMonthRange(now),
      this.getMonthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      "month",
    );

    // Weekly statistics
    const weekly = await this.getPeriodStatistics(
      this.getWeekRange(now),
      this.getWeekRange(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
      "week",
    );

    // Yearly statistics
    const yearly = await this.getPeriodStatistics(
      this.getYearRange(now),
      this.getYearRange(new Date(now.getFullYear() - 1, 0, 1)),
      "year",
    );

    return {
      monthly,
      weekly,
      yearly,
    };
  }

  /**
   * Get statistics for a specific period compared to previous period
   */
  private async getPeriodStatistics(
    currentRange: { start: Date; end: Date },
    previousRange: { start: Date; end: Date },
    periodType: "month" | "week" | "year",
  ): Promise<StatisticsComparison> {
    const createdAt = this.requireColumn("createdAt");

    // Count for current period
    const [currentResult] = await this.db
      .select({ value: count() })
      .from(this.table as PgTable)
      .where(
        and(
          gte(createdAt, currentRange.start),
          lte(createdAt, currentRange.end),
        ),
      );

    const currentCount = currentResult?.value ?? 0;

    // Count for previous period
    const [previousResult] = await this.db
      .select({ value: count() })
      .from(this.table as PgTable)
      .where(
        and(
          gte(createdAt, previousRange.start),
          lte(createdAt, previousRange.end),
        ),
      );

    const previousCount = previousResult?.value ?? 0;

    // Calculate growth
    const growth = currentCount - previousCount;
    const growthPercentage =
      previousCount > 0
        ? Math.round((growth / previousCount) * 100 * 100) / 100
        : currentCount > 0
          ? 100
          : 0;

    // Calculate percentage of total
    const totalCount = currentCount + previousCount;
    const currentPercentage =
      totalCount > 0
        ? Math.round((currentCount / totalCount) * 100 * 100) / 100
        : 0;
    const previousPercentage =
      totalCount > 0
        ? Math.round((previousCount / totalCount) * 100 * 100) / 100
        : 0;

    return {
      current: {
        count: currentCount,
        period: this.formatPeriod(currentRange.start, periodType),
        percentage: currentPercentage,
      },
      previous: {
        count: previousCount,
        period: this.formatPeriod(previousRange.start, periodType),
        percentage: previousPercentage,
      },
      growth,
      growthPercentage,
    };
  }

  /**
   * Get start and end dates for a month
   */
  private getMonthRange(date: Date): { start: Date; end: Date } {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    return { start, end };
  }

  /**
   * Get start and end dates for a week (Monday to Sunday)
   */
  private getWeekRange(date: Date): { start: Date; end: Date } {
    const ref = new Date(date);
    const day = ref.getDay();
    const diff = ref.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(ref.setDate(diff));
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  /**
   * Get start and end dates for a year
   */
  private getYearRange(date: Date): { start: Date; end: Date } {
    const start = new Date(date.getFullYear(), 0, 1);
    const end = new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { start, end };
  }

  /**
   * Format period for display
   */
  private formatPeriod(date: Date, type: "month" | "week" | "year"): string {
    if (type === "year") {
      return date.getFullYear().toString();
    }
    if (type === "month") {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }
    // Week
    const weekNumber = this.getWeekNumber(date);
    return `${date.getFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
  }

  /**
   * Get ISO week number
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }
}
