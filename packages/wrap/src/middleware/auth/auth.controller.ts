import type { Context, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppVariables, AuthIdentity } from "../../registry";

/**
 * Marks a middleware handler as produced by AuthController — swagger's
 * route scanner uses this instead of sniffing function names (see
 * swagger/index.ts). `Symbol.for` (the global registry), not a
 * module-scoped `Symbol()`: if two copies of this module ever end up
 * loaded (nested/mismatched dependency versions, separate bundles), a
 * plain `Symbol()` would mint a different value in each copy and the
 * brand check would silently fail across that boundary.
 */
export const WRAP_AUTH_MIDDLEWARE = Symbol.for("@donilite/wrap:authMiddleware");

/** Brands an `AuthController` instance — see `isAuthController()`. Same
 *  global-registry reasoning as `WRAP_AUTH_MIDDLEWARE`, and deliberately
 *  used instead of `instanceof AuthController` in `Wrap.with()`, which
 *  breaks across duplicated module instances. */
const WRAP_AUTH_CONTROLLER = Symbol.for("@donilite/wrap:authController");

function tagAsAuthMiddleware<T extends MiddlewareHandler>(handler: T): T {
  Object.defineProperty(handler, WRAP_AUTH_MIDDLEWARE, {
    value: true,
    enumerable: false,
  });
  return handler;
}

/** Structural, brand-based check for an `AuthController` instance — use
 *  this instead of `instanceof AuthController` (see `WRAP_AUTH_CONTROLLER`). */
export function isAuthController(value: unknown): value is AuthController {
  return Boolean(
    value &&
      (typeof value === "object" || typeof value === "function") &&
      (value as Record<PropertyKey, unknown>)[WRAP_AUTH_CONTROLLER],
  );
}

type AuthEnv = { Variables: AppVariables };
type AuthContext = Context<AuthEnv>;

/**
 * Strongly-typed OpenAPI 3.0.3 Security Scheme Object — the shapes an
 * `AuthController.openApiSecurityScheme()` implementation is allowed to
 * return, keyed by scheme name (matching `components.securitySchemes` in
 * the generated spec). Modeled directly on the spec's four `type` variants
 * (https://spec.openapis.org/oas/v3.0.3#security-scheme-object) instead of
 * a loose `Record<string, unknown>` bag, so implementers get
 * autocomplete/type-checking on exactly what each scheme type requires.
 */
export type OpenApiSecurityScheme =
  | { type: "http"; scheme: string; bearerFormat?: string; description?: string }
  | { type: "apiKey"; in: "header" | "query" | "cookie"; name: string; description?: string }
  | { type: "oauth2"; flows: OpenApiOAuthFlows; description?: string }
  | { type: "openIdConnect"; openIdConnectUrl: string; description?: string };

export interface OpenApiOAuthFlow {
  refreshUrl?: string;
  scopes: Record<string, string>;
}

export interface OpenApiOAuthFlows {
  implicit?: OpenApiOAuthFlow & { authorizationUrl: string };
  password?: OpenApiOAuthFlow & { tokenUrl: string };
  clientCredentials?: OpenApiOAuthFlow & { tokenUrl: string };
  authorizationCode?: OpenApiOAuthFlow & { authorizationUrl: string; tokenUrl: string };
}

export type OpenApiSecuritySchemes = Record<string, OpenApiSecurityScheme>;

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
  /** @internal brand read by `isAuthController()`. */
  readonly [WRAP_AUTH_CONTROLLER] = true;

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

  /**
   * OpenAPI security scheme(s) this strategy contributes (Wrap.swagger()
   * hook). Mandatory — every paradigm has *some* way a client authenticates,
   * and leaving this un-overridden silently produced an empty/misleading
   * `securitySchemes` block in generated docs. An instance method (not
   * static) so a combined controller (`AuthController.combine(...)`) can
   * report the merged schemes of whatever it wraps — a static method has no
   * way to reach that per-instance data.
   */
  abstract openApiSecurityScheme(): OpenApiSecuritySchemes;

  /**
   * Combine several `AuthController`s into one fallback chain: each is
   * tried in turn via `authenticate()`, and the first non-null identity
   * wins. Lets you mix paradigms in the same app — e.g. a cookie-based
   * controller for browser requests, falling back to a legacy/API-key
   * controller for clients that can't store cookies — including
   * controllers pulled from separate (even third-party/community)
   * packages, since combining only needs the public `AuthController`
   * contract, nothing paradigm-specific.
   *
   * Each delegate's `authenticate()` should already return null when it
   * doesn't apply to the request (e.g. no cookie present) rather than
   * throwing, so control passes cleanly to the next one. `revoke()` runs
   * on every delegate (best-effort) since the combined controller can't
   * generally know in a later, unrelated request which one originally
   * authenticated it — the same reason every preset's own `revoke()`
   * already has to be a safe no-op when there's nothing of its to clear.
   */
  static combine(...controllers: AuthController[]): AuthController {
    return new CombinedAuthController(controllers);
  }
}

class CombinedAuthController extends AuthController {
  constructor(private readonly controllers: AuthController[]) {
    super();
    if (controllers.length === 0) {
      throw new Error("AuthController.combine() requires at least one controller");
    }
  }

  async authenticate(c: AuthContext): Promise<AuthIdentity | null> {
    for (const controller of this.controllers) {
      const identity = await controller.authenticate(c);
      if (identity) return identity;
    }
    return null;
  }

  async revoke(c: AuthContext): Promise<void> {
    for (const controller of this.controllers) {
      await controller.revoke(c);
    }
  }

  override openApiSecurityScheme(): OpenApiSecuritySchemes {
    return Object.assign(
      {},
      ...this.controllers.map((controller) => controller.openApiSecurityScheme()),
    );
  }
}
