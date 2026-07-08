import type { Context, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppVariables, AuthIdentity } from "../../registry";

/** Marks a middleware handler as produced by AuthController — swagger's route
 *  scanner uses this instead of sniffing function names (see swagger/index.ts). */
export const WRAP_AUTH_MIDDLEWARE = Symbol("wrapAuthMiddleware");

function tagAsAuthMiddleware<T extends MiddlewareHandler>(handler: T): T {
  Object.defineProperty(handler, WRAP_AUTH_MIDDLEWARE, {
    value: true,
    enumerable: false,
  });
  return handler;
}

type AuthEnv = { Variables: AppVariables };
type AuthContext = Context<AuthEnv>;

/**
 * Paradigm-agnostic auth contract. Every request-authentication strategy
 * (JWT + cookie, DB-backed sessions, API keys, OAuth token introspection,
 * magic links, ...) implements the two abstract hooks below; the guard
 * shape (authMiddleware) is identical regardless of paradigm, so it's
 * implemented once, here.
 *
 * Authorization beyond authentication is deliberately NOT baked in as
 * roles/RBAC — `guard()` takes an arbitrary predicate over the resolved
 * identity, so permission-based, scope-based, tenant-based, or role-based
 * checks are all equally first-class. A preset that wants a role-based
 * convenience adds its own `requireRoles()` on top of `guard()` (see
 * `JwtCookieAuthController`) — the framework itself never mandates it.
 *
 * Concrete subclasses are free to constructor-inject any repository or
 * service — auth is not restricted to stateless token verification and can
 * participate in the same entity/event/transaction machinery as the rest
 * of the app.
 *
 * The identity shape (`c.get("identity")`) is typed through the registry,
 * the same mechanism as `schema`/`variables`/`roles` — see `AuthIdentity`
 * in `registry.ts`.
 */
export abstract class AuthController {
  /**
   * Resolve the identity behind this request, or null if unauthenticated.
   * Entirely paradigm-specific: verify a JWT, look up a session row in the
   * DB, validate an API key, introspect an OAuth token, etc.
   */
  abstract authenticate(c: AuthContext): Promise<AuthIdentity | null>;

  /** Tear down whatever credential this request carries (logout) — clear a
   *  cookie, delete a session row, revoke a token upstream, etc. */
  abstract revoke(c: AuthContext): Promise<void> | void;

  /** Generic guard — identical for every paradigm. */
  authMiddleware: MiddlewareHandler<AuthEnv> = tagAsAuthMiddleware(
    createMiddleware<AuthEnv>(async (c, next) => {
      const identity = await this.authenticate(c);
      if (!identity) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      c.set("identity", identity);
      await next();
    }),
  );

  /**
   * Generic authorization primitive — pass any predicate over the resolved
   * identity (roles, permissions, scopes, tenant checks, feature flags,
   * ...). Run after `authMiddleware` in the chain.
   */
  guard(
    predicate: (identity: AuthIdentity) => boolean,
    onDenied?: (c: AuthContext) => Response,
  ): MiddlewareHandler<AuthEnv> {
    return tagAsAuthMiddleware(
      createMiddleware<AuthEnv>(async (c, next) => {
        const identity = c.get("identity");
        if (!identity || !predicate(identity)) {
          return onDenied ? onDenied(c) : c.json({ error: "Access denied" }, 403);
        }
        await next();
      }),
    );
  }

  /** OpenAPI security scheme(s) this strategy contributes (Wrap.swagger() hook).
   *  Empty by default; concrete presets override. */
  static openApiSecurityScheme(): Record<string, unknown> {
    return {};
  }
}

/**
 * What `SwaggerGenerator` needs from an `AuthController` subclass — just
 * the static hook, not the constructor. `typeof AuthController` would also
 * encode the constructor's argument list, which varies per preset (e.g.
 * `JwtCookieAuthController` requires `AuthOptions`) and breaks assignability
 * for no good reason since nothing here ever calls `new`.
 */
export interface AuthControllerClass {
  openApiSecurityScheme(): Record<string, unknown>;
}
