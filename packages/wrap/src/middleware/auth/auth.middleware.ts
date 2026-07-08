import { JwtCookieAuthController } from "./jwt-cookie.controller";
import type { Auth, AuthOptions } from "./types";

export { AuthController, type AuthControllerClass } from "./auth.controller";
export { JwtCookieAuthController } from "./jwt-cookie.controller";
export type { Auth, AuthOptions } from "./types";
export { JWTSessionBase, JWTSession } from "./types";

/**
 * Build the auth stack from app configuration:
 *
 * ```ts
 * export const auth = createAuth({
 *   secret: appConfig.jwt.secret,
 *   secureCookies: appConfig.env === "production",
 * });
 * app.use("/admin/*", auth.authMiddleware);
 * ```
 *
 * @deprecated Thin compatibility shim over `JwtCookieAuthController`. Use
 * `AuthController` (extend it for your own auth paradigm) or
 * `JwtCookieAuthController` directly instead.
 */
export function createAuth(options: AuthOptions): Auth {
  const controller = new JwtCookieAuthController(options);

  return {
    authMiddleware: controller.authMiddleware,
    requireRoles: controller.requireRoles.bind(controller),
    setupCookieSession: controller.setupCookieSession.bind(controller),
    clearCookieSession: controller.clearCookieSession.bind(controller),
  };
}
