import { createFactory } from "hono/factory";
import type { JwtVariables } from "hono/jwt";
import type { UserRoles } from "@/helpers/access.helper";

export type Variables = {
  // Add custom context variables here
} & JwtVariables;

/**
 * Register the app types into the framework:
 * - schema    → typed populate (`with`) and db.query keys
 * - variables → typed Hono context
 * - roles     → typed access control (@Can, requireRoles)
 */
declare module "@donilite/wrap" {
  interface WrapRegistry {
    schema: typeof import("@/db");
    variables: Variables;
    roles: UserRoles;
  }
}

export const webFactory = createFactory<{
  Variables: Variables;
}>();
