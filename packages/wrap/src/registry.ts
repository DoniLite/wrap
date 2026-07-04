import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { JwtVariables } from "hono/jwt";

/**
 * App-level registrations, filled by the consumer through declaration
 * merging (same pattern as Hono's ContextVariableMap):
 *
 * ```ts
 * import type * as schemas from "@/db";
 *
 * declare module "@donilite/wrap" {
 *   interface WrapRegistry {
 *     schema: typeof schemas;      // tables + relations → typed populate
 *     variables: Variables;        // Hono context variables
 *     roles: UserRoles;            // access-control roles
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface WrapRegistry {}

/** The drizzle schema object registered by the app (tables + relations). */
export type RegisteredSchema = WrapRegistry extends {
  schema: infer S extends Record<string, unknown>;
}
  ? S
  : Record<string, never>;

/** Relational view of the registered schema — powers populate typing. */
export type AppSchema = ExtractTablesWithRelations<RegisteredSchema>;

/** Hono context variables registered by the app. */
export type AppVariables = WrapRegistry extends { variables: infer V extends object }
  ? V
  : JwtVariables;

/** Access-control roles registered by the app. */
export type AppRoles = WrapRegistry extends { roles: infer R extends string }
  ? R
  : string;
