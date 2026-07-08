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
 * Register the app types into the framework. No `schema` entry here —
 * this profile has no drizzle schema (no DB); `RegisteredSchema` falls
 * back to `Record<string, never>` when `schema` isn't registered (see
 * `@donilite/wrap`'s `registry.ts`). Add it back if this project grows a
 * database (see the full-backend profile's `web.factory.ts`).
 */
declare module "@donilite/wrap" {
  interface WrapRegistry {
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
