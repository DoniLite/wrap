import type { Context, MiddlewareHandler, Next } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { sign, verify } from "hono/jwt";
import type { SignatureAlgorithm } from "hono/utils/jwt/jwa";
import { logger } from "../../logger";
import { canAccess } from "../../decorators/access";
import type { AppRoles } from "../../registry";
import { JWTSessionBase } from "./types";

export interface AuthOptions {
  /** JWT signing secret */
  secret: string;
  /** JWT algorithm (default: HS256) */
  algorithm?: SignatureAlgorithm;
  /** Session cookie name (default: "session") */
  cookieName?: string;
  /** Session lifetime in seconds (default: 5h) */
  sessionMaxAgeSeconds?: number;
  /** Set the Secure flag on cookies (default: false — enable in production) */
  secureCookies?: boolean;
}

export interface Auth {
  /** Verifies the bearer token or session cookie, refreshes the session. */
  authMiddleware: MiddlewareHandler;
  /** Guard factory: only lets the given roles through (after authMiddleware). */
  requireRoles(allowed: readonly AppRoles[]): MiddlewareHandler;
  /** Sign a payload and set the session cookie. Returns the token. */
  setupCookieSession(c: Context, payload: JWTSessionBase): Promise<string>;
  clearCookieSession(c: Context): void;
}

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
 */
export function createAuth(options: AuthOptions): Auth {
  const {
    secret,
    algorithm = "HS256",
    cookieName = "session",
    sessionMaxAgeSeconds = 60 * 60 * 5,
    secureCookies = false,
  } = options;

  if (!secret) {
    throw new HTTPException(500, {
      message: "createAuth: a JWT secret is required (JWT_SECRET env)",
    });
  }

  const setupCookieSession = async (
    c: Context,
    payload: JWTSessionBase,
  ): Promise<string> => {
    const newPayload = {
      userId: payload.userId,
      role: payload.role,
      exp: Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds,
    };

    const newToken = await sign(newPayload, secret, algorithm);

    setCookie(c, cookieName, newToken, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "Lax",
      path: "/",
      maxAge: sessionMaxAgeSeconds,
    });

    c.set("jwtPayload", payload);

    return newToken;
  };

  const authMiddleware = async (c: Context, next: Next) => {
    const sessionCookie = getCookie(c, cookieName);
    const authHeader = c.req.header("Authorization");

    const token = authHeader
      ? authHeader.replace("Bearer ", "")
      : sessionCookie;

    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const payload = await verify(token, secret, algorithm);
      await setupCookieSession(c, JWTSessionBase.from(payload));
      await next();
    } catch (e) {
      logger.warn("JWT verification failed", { path: c.req.path }, e);
      return c.json({ error: "Unauthorized" }, 401);
    }
  };

  const requireRoles = (allowed: readonly AppRoles[]): MiddlewareHandler => {
    return async (c: Context, next: Next) => {
      const payload = c.get("jwtPayload") as { role?: AppRoles } | undefined;
      if (!payload || !canAccess(payload.role, allowed)) {
        return c.json({ error: "Access denied" }, 403);
      }
      await next();
    };
  };

  const clearCookieSession = (c: Context) => {
    deleteCookie(c, cookieName);
  };

  return {
    authMiddleware,
    requireRoles,
    setupCookieSession,
    clearCookieSession,
  };
}

export { JWTSessionBase, JWTSession } from "./types";
