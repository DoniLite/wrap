import { z } from "zod";
import { DTO } from "../../decorators";
import { SchemaDTO } from "../../dto";
import type { AppRoles } from "../../registry";
import { MiddlewareHandler, Context } from "hono";
import { SignatureAlgorithm } from "hono/utils/jwt/jwa";

const jwtSessionBaseSchema = z.object({
  userId: z.string(),
  role: z.string(),
});

@DTO()
export class JWTSessionBase extends SchemaDTO(jwtSessionBaseSchema) {
  declare role: AppRoles;

  /**
   * Creates a JWTSessionBase from a user object, properly mapping 'id' to 'userId'
   */
  static fromUser(user: Record<string, unknown>): JWTSessionBase {
    const instance = new JWTSessionBase();
    instance.userId = user.id as string;
    instance.role = user.role as AppRoles;
    return instance;
  }
}

@DTO()
export class JWTSession extends JWTSessionBase {
  static override schema = jwtSessionBaseSchema.extend({
    exp: z.number(),
  });

  declare exp: number;
}

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

/**
 * Legacy shape returned by the deprecated `createAuth()`. The generic,
 * paradigm-agnostic contract now lives in `AuthController`
 * (./auth.controller.ts) — this interface only describes the JWT-cookie
 * preset's own public surface, kept for backward compatibility.
 */
export interface Auth {
  /** Verifies the bearer token or session cookie, refreshes the session. */
  authMiddleware: MiddlewareHandler;
  /** Guard factory: only lets the given roles through (after authMiddleware). */
  requireRoles(allowed: readonly AppRoles[]): MiddlewareHandler;
  /** Sign a payload and set the session cookie. Returns the token. */
  setupCookieSession(c: Context, payload: JWTSessionBase): Promise<string>;
  clearCookieSession(c: Context): void;
}
