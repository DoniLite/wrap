import { createAuth } from "@donilite/wrap";
import { appConfig } from "@/config/app.config";
import { WRITE_ACCESS } from "@/helpers/access.helper";

/**
 * App auth stack, built from configuration. Roles are typed through
 * the WrapRegistry augmentation (see factory/web.factory.ts).
 */
export const auth = createAuth({
  secret: appConfig.jwt.secret,
  secureCookies: appConfig.env === "production",
});

export const { authMiddleware, setupCookieSession, clearCookieSession } = auth;

/** Admin guard — run after authMiddleware. */
export const adminMiddleware = auth.requireRoles(WRITE_ACCESS);
