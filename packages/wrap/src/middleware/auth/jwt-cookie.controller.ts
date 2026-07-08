import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { sign, verify } from "hono/jwt";
import { logger } from "../../logger";
import { canAccess } from "../../decorators/access";
import type { AppRoles, AppVariables, AuthIdentity } from "../../registry";
import { AuthController } from "./auth.controller";
import type { AuthOptions } from "./types";
import { JWTSessionBase } from "./types";

type AuthContext = Context<{ Variables: AppVariables }>;

/**
 * Reference `AuthController` preset: bearer token or session cookie,
 * verified/signed with a shared JWT secret. Sessions slide — every
 * authenticated request re-signs and refreshes the cookie.
 */
export class JwtCookieAuthController extends AuthController {
  private readonly secret: string;
  private readonly algorithm: NonNullable<AuthOptions["algorithm"]>;
  private readonly cookieName: string;
  private readonly sessionMaxAgeSeconds: number;
  private readonly secureCookies: boolean;

  constructor(options: AuthOptions) {
    super();
    const {
      secret,
      algorithm = "HS256",
      cookieName = "session",
      sessionMaxAgeSeconds = 60 * 60 * 5,
      secureCookies = false,
    } = options;

    if (!secret) {
      throw new HTTPException(500, {
        message:
          "JwtCookieAuthController: a JWT secret is required (JWT_SECRET env)",
      });
    }

    this.secret = secret;
    this.algorithm = algorithm;
    this.cookieName = cookieName;
    this.sessionMaxAgeSeconds = sessionMaxAgeSeconds;
    this.secureCookies = secureCookies;
  }

  async authenticate(c: AuthContext): Promise<AuthIdentity | null> {
    const sessionCookie = getCookie(c, this.cookieName);
    const authHeader = c.req.header("Authorization");
    const token = authHeader
      ? authHeader.replace("Bearer ", "")
      : sessionCookie;

    if (!token) return null;

    try {
      const payload = await verify(token, this.secret, this.algorithm);
      const identity = JWTSessionBase.from(payload) as unknown as AuthIdentity;
      // Sliding session: re-sign + refresh the cookie on every authenticated request.
      await this.setupCookieSession(c, identity);
      return identity;
    } catch (e) {
      logger.warn("JWT verification failed", { path: c.req.path }, e);
      return null;
    }
  }

  async revoke(c: AuthContext): Promise<void> {
    deleteCookie(c, this.cookieName);
  }

  /**
   * Role-based convenience built on the generic `guard()` — this preset's
   * own opinion, not a framework mandate. Reads `identity.role` if present.
   */
  requireRoles(allowed: readonly AppRoles[]): MiddlewareHandler {
    return this.guard((identity) => {
      const role = (identity as { role?: AppRoles }).role;
      return role !== undefined && canAccess(role, allowed);
    });
  }

  /** Sign a payload and set the session cookie. Call after a successful login. */
  async setupCookieSession(
    c: AuthContext,
    payload: JWTSessionBase | AuthIdentity,
  ): Promise<string> {
    const { userId, role } = payload as { userId: string; role: AppRoles };
    const newPayload = {
      userId,
      role,
      exp: Math.floor(Date.now() / 1000) + this.sessionMaxAgeSeconds,
    };

    const newToken = await sign(newPayload, this.secret, this.algorithm);

    setCookie(c, this.cookieName, newToken, {
      httpOnly: true,
      secure: this.secureCookies,
      sameSite: "Lax",
      path: "/",
      maxAge: this.sessionMaxAgeSeconds,
    });

    c.set("identity", payload as AuthIdentity);

    return newToken;
  }

  /** Alias kept for parity with the legacy `Auth` interface. */
  clearCookieSession(c: AuthContext): void {
    this.revoke(c);
  }

  static override openApiSecurityScheme(): Record<string, unknown> {
    return {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "session",
      },
    };
  }
}
