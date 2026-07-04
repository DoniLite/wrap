/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  relations,
  type BuildColumns,
  type InferSelectModel,
  type Many,
  type One,
  type Relation,
  type Relations,
} from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  type PgColumn,
  type PgColumnBuilderBase,
  type PgTable,
  type PgTableWithColumns,
} from "drizzle-orm/pg-core";

/**
 * Framework-owned base columns — every entity gets them automatically.
 * This is the runtime counterpart of the `BaseTable` type constraint.
 */
export const BaseRow = {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
};

type EntityTableFor<
  TName extends string,
  TColumns extends Record<string, PgColumnBuilderBase>,
> = PgTableWithColumns<{
  name: TName;
  schema: undefined;
  columns: BuildColumns<TName, typeof BaseRow & TColumns, "pg">;
  dialect: "pg";
}>;

/** Anything that carries a drizzle table (an entity class). */
export interface EntityLike {
  readonly table: PgTable;
}

/**
 * Helpers handed to the `relations` callback of an entity definition.
 * Targets are referenced lazily through class thunks, so relations can
 * safely point at entities from other feature slices.
 */
export interface EntityRelationBuilders<Tb extends PgTable> {
  /** The entity's own table — use it to reference the FK columns. */
  self: Tb;
  /** Object relation (`belongs to one`). `references` defaults to the target's `id`. */
  one<TE extends EntityLike>(
    target: () => TE,
    config?: {
      fields: PgColumn[];
      references?: (table: TE["table"]) => PgColumn[];
    },
  ): One<TE["table"]["_"]["name"]>;
  /** Array relation (`has many`). */
  many<TE extends EntityLike>(target: () => TE): Many<TE["table"]["_"]["name"]>;
}

export interface EntityOptions<
  Tb extends PgTable,
  TRel extends Record<string, Relation>,
> {
  /**
   * Explicit relations of this entity — required for populate (`with`).
   * Both kinds can be combined: `({ one, many, self }) => ({ ... })`.
   */
  relations?: (helpers: EntityRelationBuilders<Tb>) => TRel;
}

/**
 * An entity class as returned by `Entity(...)`:
 * - `InstanceType<typeof X>` is the typed row (select model)
 * - `X.table` is the underlying drizzle table
 */
export type EntityClass<
  Tb extends PgTable = PgTable,
  TRel extends Record<string, Relation> = Record<string, Relation>,
> = {
  new (): InferSelectModel<Tb>;
  readonly table: Tb;
  readonly tableName: Tb["_"]["name"];
  readonly relationsConfig?: (helpers: EntityRelationBuilders<Tb>) => TRel;
};

/**
 * Define an entity as a class, colocated in its feature slice.
 * The drizzle table is built internally (`BaseRow` + your columns) —
 * the class is the definition vehicle (data-mapper: repositories keep
 * returning plain typed rows).
 *
 * @example
 * export class Example extends Entity("examples", {
 *   name: text("name").notNull(),
 * }, {
 *   relations: ({ many }) => ({ items: many(() => ExampleItem) }),
 * }) {}
 *
 * // drizzle-kit + populate typing need these two named exports:
 * export const ExampleTable = Example.table;
 * export const ExampleRelations = relationsOf(Example);
 */
export function Entity<
  TName extends string,
  TColumns extends Record<string, PgColumnBuilderBase>,
  TRel extends Record<string, Relation> = Record<string, never>,
>(
  name: TName,
  columns: TColumns,
  options?: EntityOptions<EntityTableFor<TName, TColumns>, TRel>,
): EntityClass<EntityTableFor<TName, TColumns>, TRel> {
  const table = pgTable(name, { ...BaseRow, ...columns });

  class EntityBase {
    static readonly table = table;
    static readonly tableName = name;
    static readonly relationsConfig = options?.relations;
  }

  return EntityBase as unknown as EntityClass<
    EntityTableFor<TName, TColumns>,
    TRel
  >;
}

/**
 * Build the drizzle `relations()` value of an entity, from the config
 * declared in its definition — or from the callback passed here, which
 * is the safe form when two entities reference each other (mutual
 * references inside `extends Entity(...)` clauses are a TS type cycle).
 * The callback is evaluated lazily by drizzle (at schema build time),
 * after every entity module has been loaded.
 */
export function relationsOf<
  Tb extends PgTable,
  TRel extends Record<string, Relation>,
>(entity: EntityClass<Tb, TRel>): Relations<Tb["_"]["name"], TRel>;
export function relationsOf<
  Tb extends PgTable,
  TRel extends Record<string, Relation>,
>(
  entity: EntityClass<Tb, any>,
  config: (helpers: EntityRelationBuilders<Tb>) => TRel,
): Relations<Tb["_"]["name"], TRel>;
export function relationsOf<
  Tb extends PgTable,
  TRel extends Record<string, Relation>,
>(
  entity: EntityClass<Tb, TRel>,
  explicitConfig?: (helpers: EntityRelationBuilders<Tb>) => TRel,
): Relations<Tb["_"]["name"], TRel> {
  const config = explicitConfig ?? entity.relationsConfig;
  if (!config) {
    throw new Error(
      `${entity.tableName} has no relations config. ` +
        `Declare them in Entity(..., { relations: ... }) or pass them to relationsOf(entity, ...).`,
    );
  }

  return relations(entity.table, (drizzle) => {
    const helpers: EntityRelationBuilders<Tb> = {
      self: entity.table,
      one: (target, cfg) => {
        const targetTable = target().table;
        if (!cfg) return drizzle.one(targetTable) as any;
        const references = cfg.references
          ? cfg.references(targetTable)
          : [(targetTable as any).id as PgColumn];
        return drizzle.one(targetTable, {
          fields: cfg.fields as any,
          references: references as any,
        }) as any;
      },
      many: (target) => drizzle.many(target().table) as any,
    };
    return config(helpers);
  }) as Relations<Tb["_"]["name"], TRel>;
}

/** Resolve a table from either an entity class or a raw drizzle table. */
export function tableOf<S extends PgTable | EntityLike>(
  source: S,
): S extends EntityLike ? S["table"] : S {
  return (
    typeof source === "function" && "table" in source
      ? (source as EntityLike).table
      : source
  ) as any;
}
