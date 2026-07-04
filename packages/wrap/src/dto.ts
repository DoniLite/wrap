/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { getTableName, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { SortOrder, type PaginatedResponse } from "./types/pagination";
import { tableOf, type EntityLike } from "./entity";
import { DTO, DTO_CLASSES } from "./decorators";

/** A DTO source: a drizzle table or an entity class carrying one. */
export type DTOSource = PgTable | EntityLike;
type SourceTable<S extends DTOSource> = S extends EntityLike ? S["table"] : S;

/**
 * Shape of a DTO class: an OOP envelope around a zod schema.
 * The schema is the single source of truth for typing, validation
 * and OpenAPI generation.
 */
export interface DTOClass<T = unknown> {
  new (): T & BaseDTO;
  readonly name: string;
  schema: z.ZodObject<any>;
  from<C extends new () => any>(this: C, plain: unknown): InstanceType<C>;
  safeFrom<C extends new () => any>(
    this: C,
    plain: unknown,
  ):
    | { success: true; data: InstanceType<C> }
    | { success: false; error: z.ZodError };
}

export abstract class BaseDTO {
  /**
   * The zod schema backing this DTO — single source of truth for
   * validation, typing and OpenAPI. Override it in subclasses:
   * `static override schema = Parent.schema.extend({ ... })`
   */
  static schema: z.ZodObject<any> = z.object({});

  /**
   * Create a validated instance of the DTO from a plain object.
   * Parsing strips unknown keys (whitelist behavior) and throws a
   * ZodError when validation fails. Use `safeFrom()` for a
   * non-throwing variant.
   */
  static from<T extends BaseDTO>(this: new () => T, plain: unknown): T {
    const cls = this as unknown as typeof BaseDTO;
    const parsed = cls.schema.parse(plain);
    return Object.assign(new this(), parsed);
  }

  /**
   * @deprecated The whitelist behavior is now the default of `from()`.
   */
  static fromStrict<T extends BaseDTO>(this: new () => T, plain: unknown): T {
    return (this as unknown as DTOClass).from(plain) as unknown as T;
  }

  /**
   * Non-throwing variant of `from()`.
   */
  static safeFrom<T extends BaseDTO>(
    this: new () => T,
    plain: unknown,
  ): { success: true; data: T } | { success: false; error: z.ZodError } {
    const cls = this as unknown as typeof BaseDTO;
    const result = cls.schema.safeParse(plain);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, data: Object.assign(new this(), result.data) };
  }

  /**
   * Validate the current DTO instance against its schema.
   * @returns The list of issues — empty when the instance is valid.
   */
  validate(): z.core.$ZodIssue[] {
    const cls = this.constructor as typeof BaseDTO;
    const result = cls.schema.safeParse({ ...this });
    return result.success ? [] : result.error.issues;
  }
}

/**
 * Create a DTO class from an arbitrary zod object schema.
 * The returned class is meant to be extended:
 * `class MyDTO extends SchemaDTO(z.object({ ... })) {}`
 */
export function SchemaDTO<S extends z.ZodObject<any>>(
  schema: S,
  name?: string,
): DTOClass<z.infer<S>> {
  class SchemaBackedDTO extends BaseDTO {
    static override schema: z.ZodObject<any> = schema;
  }
  if (name) {
    Object.defineProperty(SchemaBackedDTO, "name", { value: name });
    DTO_CLASSES.set(name, SchemaBackedDTO);
  }
  return SchemaBackedDTO as unknown as DTOClass<z.infer<S>>;
}

export interface TableDTOOptions<K extends string = string> {
  /** Columns to leave out of the generated schema */
  exclude?: K[];
}

function omitKeys(
  schema: z.ZodObject<any>,
  keys: readonly string[] | undefined,
): z.ZodObject<any> {
  if (!keys || keys.length === 0) return schema;
  const mask = Object.fromEntries(keys.map((key) => [key, true as const]));
  return schema.omit(mask as any);
}

function registerTableDTO(name: string, schema: z.ZodObject<any>): DTOClass {
  const existing = DTO_CLASSES.get(name);
  if (existing) return existing as unknown as DTOClass;

  class TableDTO extends BaseDTO {
    static override schema: z.ZodObject<any> = schema;
  }
  Object.defineProperty(TableDTO, "name", { value: name });
  DTO_CLASSES.set(name, TableDTO);
  return TableDTO as unknown as DTOClass;
}

function excludeSuffix(keys: readonly string[] | undefined): string {
  return keys && keys.length > 0 ? `_excluded_${[...keys].sort().join("_")}` : "";
}

/**
 * DTO derived from the table's SELECT shape (the entity as returned by
 * queries). Accepts an entity class or a raw drizzle table.
 *
 * @example
 * export const ExampleBase = SelectDTO(Example, { exclude: ["deletedAt"] });
 */
export function SelectDTO<
  Src extends DTOSource,
  const K extends keyof SourceTable<Src>["_"]["columns"] & string = never,
>(
  source: Src,
  options: TableDTOOptions<K> = {},
): DTOClass<Omit<InferSelectModel<SourceTable<Src>>, K>> {
  const table = tableOf(source) as PgTable;
  const schema = omitKeys(
    createSelectSchema(table) as unknown as z.ZodObject<any>,
    options.exclude,
  );
  const name = `${getTableName(table)}Base${excludeSuffix(options.exclude)}`;
  return registerTableDTO(name, schema) as DTOClass<
    Omit<InferSelectModel<SourceTable<Src>>, K>
  >;
}

const INSERT_EXCLUDED = ["id", "createdAt", "updatedAt", "deletedAt"] as const;
type InsertExcluded = (typeof INSERT_EXCLUDED)[number];

/**
 * DTO derived from the table's INSERT shape. Base columns
 * (id, createdAt, updatedAt, deletedAt) are excluded by default.
 * Accepts an entity class or a raw drizzle table.
 *
 * @example
 * export class CreateExampleDTO extends InsertDTO(Example) {}
 */
export function InsertDTO<
  Src extends DTOSource,
  const K extends keyof SourceTable<Src>["_"]["columns"] & string = never,
>(
  source: Src,
  options: TableDTOOptions<K> = {},
): DTOClass<Omit<InferInsertModel<SourceTable<Src>>, K | InsertExcluded>> {
  const table = tableOf(source) as PgTable;
  const excluded = [
    ...INSERT_EXCLUDED.filter(
      (key) => key in (table as unknown as Record<string, unknown>),
    ),
    ...(options.exclude ?? []),
  ];
  const schema = omitKeys(
    createInsertSchema(table) as unknown as z.ZodObject<any>,
    excluded,
  );
  const name = `${getTableName(table)}Insert${excludeSuffix(options.exclude)}`;
  return registerTableDTO(name, schema) as DTOClass<
    Omit<InferInsertModel<SourceTable<Src>>, K | InsertExcluded>
  >;
}

/**
 * Derive a DTO class whose fields are all optional (PATCH/PUT semantics).
 */
export function PartialDTO<T>(DTOClassRef: DTOClass<T>): DTOClass<Partial<T>> {
  const name = `Partial${DTOClassRef.name}`;
  const existing = DTO_CLASSES.get(name);
  if (existing) return existing as unknown as DTOClass<Partial<T>>;

  class PartialClass extends BaseDTO {
    static override schema: z.ZodObject<any> = DTOClassRef.schema.partial();
  }
  Object.defineProperty(PartialClass, "name", { value: name });
  DTO_CLASSES.set(name, PartialClass);
  return PartialClass as unknown as DTOClass<Partial<T>>;
}

/**
 * Paginated wrapper DTO around an item DTO class.
 */
export function PaginatedResponseDTO<T>(
  ItemClass: DTOClass<T>,
): DTOClass<PaginatedResponse<T>> {
  const name = `Paginated${ItemClass.name}Response`;
  const existing = DTO_CLASSES.get(name);
  if (existing) return existing as unknown as DTOClass<PaginatedResponse<T>>;

  class PaginatedResponseClass extends BaseDTO {
    static override schema: z.ZodObject<any> = z.object({
      items: z.array(ItemClass.schema),
      itemCount: z.number(),
      page: z.number(),
      pageSize: z.number(),
      pageCount: z.number(),
    });
  }
  Object.defineProperty(PaginatedResponseClass, "name", { value: name });
  DTO_CLASSES.set(name, PaginatedResponseClass);
  return PaginatedResponseClass as unknown as DTOClass<PaginatedResponse<T>>;
}

// ===== Base DTOs =====

@DTO()
export class PaginationQuerysDTO extends SchemaDTO(
  z.object({
    page: z.coerce.number().optional(),
    pageSize: z.coerce.number().optional(),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(SortOrder).optional(),
    includeDeleted: z.coerce.boolean().optional(),
    populateChildren: z.coerce.boolean().optional(),
    filters: z
      .record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
      )
      .optional(),
  }),
) {}

@DTO()
export class BaseErrorDTO extends SchemaDTO(
  z.object({
    message: z.string(),
    success: z.boolean().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
) {}

@DTO()
export class BaseDeletedSuccessDTO extends SchemaDTO(
  z.object({
    deleted: z.boolean(),
    id: z.string(),
  }),
) {}

@DTO()
export class DeleteMultipleDTO extends SchemaDTO(
  z.object({
    ids: z.array(z.string()),
  }),
) {}

@DTO()
export class BaseDeleteMultipleSuccessDTO extends SchemaDTO(
  z.object({
    deleted: z.boolean(),
    deletedCount: z.number(),
    requestedCount: z.number(),
    message: z.string().optional(),
  }),
) {}

const statisticsPeriodSchema = z.object({
  count: z.number(),
  period: z.string(),
  percentage: z.number().optional(),
});

const statisticsComparisonSchema = z.object({
  current: statisticsPeriodSchema,
  previous: statisticsPeriodSchema,
  growth: z.number(),
  growthPercentage: z.number(),
});

@DTO()
export class StatisticsPeriodDTO extends SchemaDTO(statisticsPeriodSchema) {}

@DTO()
export class StatisticsComparisonDTO extends SchemaDTO(
  statisticsComparisonSchema,
) {}

@DTO()
export class EntityStatisticsDTO extends SchemaDTO(
  z.object({
    monthly: statisticsComparisonSchema,
    weekly: statisticsComparisonSchema,
    yearly: statisticsComparisonSchema,
  }),
) {}

// ===== Serialization =====

const serializationSchemaCache = new WeakMap<z.ZodType, z.ZodType>();

function toSerializationType(type: z.ZodType): z.ZodType {
  if (type instanceof z.ZodOptional) {
    return toSerializationType(type.unwrap() as z.ZodType).optional();
  }
  if (type instanceof z.ZodNullable) {
    return toSerializationType(type.unwrap() as z.ZodType).nullable();
  }
  if (type instanceof z.ZodArray) {
    return z.array(toSerializationType(type.element as z.ZodType));
  }
  if (type instanceof z.ZodObject) {
    return toSerializationSchema(type);
  }
  if (type instanceof z.ZodDate) {
    // Serialized payloads carry dates as ISO strings while fresh entities
    // carry Date objects — accept both and emit ISO strings.
    return z
      .union([z.date(), z.string()])
      .transform((value) =>
        value instanceof Date ? value.toISOString() : value,
      );
  }
  return type;
}

/**
 * Derive the output (serialization) schema of a DTO schema: identical
 * shape, but date fields accept `Date | string` and emit ISO strings.
 */
export function toSerializationSchema(schema: z.ZodObject<any>): z.ZodObject<any> {
  const cached = serializationSchemaCache.get(schema);
  if (cached) return cached as z.ZodObject<any>;

  const shape: Record<string, z.ZodType> = {};
  for (const [key, value] of Object.entries(schema.shape)) {
    shape[key] = toSerializationType(value as z.ZodType);
  }
  const out = z.object(shape);
  serializationSchemaCache.set(schema, out);
  return out;
}
