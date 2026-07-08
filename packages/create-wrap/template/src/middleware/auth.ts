import { JwtCookieAuthController } from "@donilite/wrap";
import { appConfig } from "@/config/app.config";
import { WRITE_ACCESS } from "@/helpers/access.helper";

/**
 * App auth stack. `auth` is the single source of truth passed to
 * `app.with(auth)` (see src/index.ts) — swap `JwtCookieAuthController` for
 * your own `AuthController` subclass to use a different paradigm (DB
 * sessions, API keys, ...); nothing else in the app depends on the
 * concrete strategy, only on the `AuthController` contract.
 */
export const auth = new JwtCookieAuthController({
  secret: appConfig.jwt.secret,
  secureCookies: appConfig.env === "production",
});

export const authMiddleware = auth;
export const setupCookieSession = auth.setupCookieSession.bind(auth);
export const clearCookieSession = auth.clearCookieSession.bind(auth);

/** Admin guard — run after authMiddleware. */
export const adminMiddleware = auth.requireRoles(WRITE_ACCESS);
