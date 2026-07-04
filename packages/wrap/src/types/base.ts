import type {
  BuildQueryResult,
  DBQueryConfig,
  FindTableByDBName,
  InferInsertModel,
  InferSelectModel,
  TableRelationalConfig,
} from "drizzle-orm";
import type {
  PgColumn,
  PgTableWithColumns,
  PgUpdateSetSource,
} from "drizzle-orm/pg-core";
import type { AppSchema } from "../registry";

/**
 * Columns every framework table must define.
 * Aligned with `BaseRow` in core/entity.ts.
 * (Record keeps the implicit index signature drizzle's TableConfig expects.)
 */
type BaseColumns = Record<
  "id" | "createdAt" | "updatedAt" | "deletedAt",
  PgColumn
>;

type BaseTableConfig = {
  name: string;
  schema: string | undefined;
  columns: BaseColumns;
  dialect: "pg";
};

/**
 * Constraint for tables usable with BaseRepository.
 * Any table built with `pgTable("...", { ...BaseRow, ... })` satisfies it.
 */
export type BaseTable = PgTableWithColumns<BaseTableConfig>;

// ===== Types derived from the table (single source of truth) =====

/** The entity shape as returned by SELECT queries. */
export type InferEntity<Tb extends BaseTable> = InferSelectModel<Tb>;

/** The shape accepted by INSERT queries (create DTOs must be compatible). */
export type InferCreate<Tb extends BaseTable> = InferInsertModel<Tb>;

/** The shape accepted by UPDATE queries (update DTOs must be compatible). */
export type InferUpdate<Tb extends BaseTable> = PgUpdateSetSource<Tb>;

// ===== Relational (populate) types, powered by the registered schema =====

export type { AppSchema } from "../registry";

/** Relational config of a table inside the app schema, found by its SQL name. */
export type TableConfigOf<Tb extends BaseTable> =
  FindTableByDBName<AppSchema, Tb["_"]["name"]> extends infer C extends
    TableRelationalConfig
    ? C
    : never;

/**
 * Valid `with` configurations for a table — the relations declared with
 * `relations()` in the schema. Fully typed by Drizzle.
 * (The `never` guard keeps the type shallow when no schema is registered,
 * e.g. while compiling the package itself.)
 */
export type WithConfig<Tb extends BaseTable> = [TableConfigOf<Tb>] extends [
  never,
]
  ? Record<string, unknown> | undefined
  : DBQueryConfig<"many", true, AppSchema, TableConfigOf<Tb>>["with"];

/** Entity shape including the relations selected by a `with` config. */
export type Populated<
  Tb extends BaseTable,
  W extends NonNullable<WithConfig<Tb>>,
> = [TableConfigOf<Tb>] extends [never]
  ? InferEntity<Tb>
  : BuildQueryResult<AppSchema, TableConfigOf<Tb>, { with: W }>;

/** Result of a read method: populated when a `with` config was provided. */
export type FindResult<
  Tb extends BaseTable,
  W extends WithConfig<Tb> | undefined = undefined,
> = W extends NonNullable<WithConfig<Tb>> ? Populated<Tb, W> : InferEntity<Tb>;

/** Options accepted by BaseRepository read methods. */
export interface FindOptions<
  Tb extends BaseTable,
  W extends WithConfig<Tb> | undefined = undefined,
> {
  /** Relations to load (typed against the schema's `relations()`). */
  with?: W;
  /** Include soft-deleted rows (`deletedAt` set). Default: false. */
  includeDeleted?: boolean;
}

export interface CrudOperations<Tb extends BaseTable, TCreate, TUpdate> {
  create(dto: TCreate): Promise<InferEntity<Tb>>;
  findById<W extends WithConfig<Tb> | undefined = undefined>(
    id: string | number,
    options?: FindOptions<Tb, W>,
  ): Promise<FindResult<Tb, W> | null>;
  findAll<W extends WithConfig<Tb> | undefined = undefined>(
    filters?: Partial<InferEntity<Tb>>,
    options?: FindOptions<Tb, W>,
  ): Promise<FindResult<Tb, W>[]>;
  update(id: string | number, dto: TUpdate): Promise<InferEntity<Tb>[] | null>;
  delete(id: string | number): Promise<boolean>;
}

export type bodyGetter = "query" | "formData" | "json";

export type ContextInstance<T extends bodyGetter> = {
  query: Record<string, string | string[]>;
  formData: FormData;
  json: Record<string, unknown>;
}[T];
