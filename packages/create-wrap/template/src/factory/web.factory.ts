import { createFactory } from "hono/factory";
import type { JwtVariables } from "hono/jwt";
import type { AppVariables } from "@donilite/wrap";
import type { UserRoles } from "@/helpers/access.helper";

/** Custom context variables this app contributes — the framework merges in
 *  its own (e.g. `identity`, set by AuthController) automatically. */
export type Variables = {
  // Add custom context variables here
} & JwtVariables;

/**
 * Register the app types into the framework:
 * - schema    → typed populate (`with`) and db.query keys
 * - variables → typed Hono context (the app's own contribution)
 * - roles     → typed access control (@Can, requireRoles)
 */
declare module "@donilite/wrap" {
  interface WrapRegistry {
    schema: typeof import("@/db");
    variables: Variables;
    roles: UserRoles;
  }
}

// Typed with the framework-merged `AppVariables` (Variables + identity, see
// registry.ts), not the bare `Variables` above — every Hono app a
// controller builds needs to agree with what AuthController/Wrap expect.
export const webFactory = createFactory<{
  Variables: AppVariables;
}>();
