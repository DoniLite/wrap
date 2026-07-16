---
title: Auth
parent: API reference
nav_order: 5
---

`packages/wrap/src/middleware/auth/auth.controller.ts` (contract + `combine()`) and `middleware/auth/jwt-cookie.controller.ts` (shipped preset). See also: [Auth guide](../guide/auth.md).

## `AuthController` (abstract)

```ts
abstract class AuthController {
  readonly [WRAP_AUTH_CONTROLLER]: true; // brand field — see "Branding" below

  abstract authenticate(c: Context): Promise<AuthIdentity | null>;
  abstract revoke(c: Context): Promise<void> | void;
  abstract openApiSecurityScheme(): OpenApiSecuritySchemes;

  authMiddleware: MiddlewareHandler<{ Variables: AppVariables }>;

  guard(
    predicate: (identity: AuthIdentity) => boolean,
    onDenied?: (c: Context) => Response | Promise<Response>,
  ): MiddlewareHandler<{ Variables: AppVariables }>;

  static combine(...controllers: AuthController[]): AuthController;
}
```

### `authenticate(c)` — abstract, paradigm-specific

Resolve the identity behind this request, or `null` if unauthenticated. Verify a JWT, look up a session row, validate an API key, introspect an OAuth token — entirely up to the implementation. Free to constructor-inject a repository/service.

### `revoke(c)` — abstract, paradigm-specific

Tear down whatever credential this request carries (logout): clear a cookie, delete a session row, revoke a token upstream. Should be a safe no-op when there's nothing to clear (matters for `combine()` — see below).

### `openApiSecurityScheme()` — abstract, paradigm-specific

```ts
type OpenApiSecurityScheme =
  | { type: "http"; scheme: string; bearerFormat?: string; description?: string }
  | { type: "apiKey"; in: "header" | "query" | "cookie"; name: string; description?: string }
  | { type: "oauth2"; flows: OpenApiOAuthFlows; description?: string }
  | { type: "openIdConnect"; openIdConnectUrl: string; description?: string };

type OpenApiSecuritySchemes = Record<string, OpenApiSecurityScheme>;
```

Declares the scheme(s) this strategy contributes to the generated OpenAPI spec (`components.securitySchemes`) — see [Swagger](swagger.md#security-schemes). Mandatory: an un-overridden scheme used to silently produce empty/misleading docs, so there is no default implementation.

### `authMiddleware` — generic, implemented once

```ts
authMiddleware: MiddlewareHandler<{ Variables: AppVariables }>
```

Calls `authenticate(c)`; `401`s if it returns `null`; otherwise `c.set("identity", identity)` and continues. Identical for every paradigm — not something a preset overrides. Apply it explicitly wherever a route group needs it: `app.use("/admin/*", auth.authMiddleware)`. Internally tagged (`WRAP_AUTH_MIDDLEWARE`, a `Symbol.for(...)` global-registry symbol — resilient to duplicated module instances, unlike `instanceof`) so [Swagger generation](swagger.md#security-schemes) can detect a guarded route without sniffing the function's name.

### `guard(predicate, onDenied?)` — generic authorization

```ts
guard(
  predicate: (identity: AuthIdentity) => boolean,
  onDenied?: (c: Context) => Response | Promise<Response>,
): MiddlewareHandler
```

Reads `c.get("identity")` (set by `authMiddleware`, which must run first) and checks it against `predicate`. On failure, calls `onDenied(c)` if given, else responds `403`. Paradigm-independent and role-agnostic by design — see [Auth guide — no forced RBAC](../guide/auth.md#no-forced-rbac). A preset that wants role-based convenience builds it on top (`JwtCookieAuthController.requireRoles`, below) rather than the framework baking in a `role` field.

### `static combine(...controllers)`

```ts
static combine(...controllers: AuthController[]): AuthController
```

Returns a `CombinedAuthController` (internal, not exported directly — always obtained via `combine()`):

- `authenticate(c)` — tries each delegate's `authenticate()` in registration order; returns the first non-null identity, or `null` if all delegates return `null`.
- `revoke(c)` — calls every delegate's `revoke()` (best-effort; relies on each preset's own safe-no-op contract).
- `openApiSecurityScheme()` — `Object.assign({}, ...delegates.map(d => d.openApiSecurityScheme()))`, so the generated spec advertises every delegate's scheme.

Use it to chain fallback paradigms in one app — e.g. cookie sessions for browsers, an API-key controller for clients that can't store cookies. See [Auth guide — combining paradigms](../guide/auth.md#combining-paradigms-authcontrollercombine).

### Branding (`WRAP_AUTH_CONTROLLER` / `WRAP_AUTH_MIDDLEWARE`)

```ts
const WRAP_AUTH_CONTROLLER = Symbol.for("@donilite/wrap:authController");
const WRAP_AUTH_MIDDLEWARE = Symbol.for("@donilite/wrap:authMiddleware");
function isAuthController(value: unknown): value is AuthController;
```

Both use `Symbol.for` (the global symbol registry), not a module-scoped `Symbol()` — so the brand check still works if `@donilite/wrap` ends up duplicated across module instances (a monorepo with mismatched hoisting, a linked package, etc.), where `instanceof` would silently fail. `Wrap.with()` uses `isAuthController()` to decide whether an argument is an `AuthController` or a plain middleware — see [Wrap](wrap.md#withpluginormiddleware).

## `JwtCookieAuthController extends AuthController`

```ts
interface AuthOptions {
  secret: string;
  algorithm?: string;              // default "HS256"
  cookieName?: string;              // default "session"
  sessionMaxAgeSeconds?: number;    // default 7 days
  secureCookies?: boolean;          // default false — set true in production (HTTPS)
}

class JwtCookieAuthController extends AuthController {
  constructor(options: AuthOptions); // throws HTTPException(500) if options.secret is empty

  authenticate(c: Context): Promise<AuthIdentity | null>;
  revoke(c: Context): void;                          // deletes the session cookie
  clearCookieSession(c: Context): void;                // alias for revoke

  requireRoles(allowed: readonly AppRoles[]): MiddlewareHandler;

  setupCookieSession(
    c: Context,
    payload: JWTSessionBase,
  ): Promise<string>; // signs a JWT, sets it as the session cookie, `c.set("identity", payload)`; returns the token

  openApiSecurityScheme(): OpenApiSecuritySchemes; // { bearerAuth: {...}, cookieAuth: {...} }
}
```

`authenticate()` checks the session cookie first, then falls back to an `Authorization: Bearer` header; verifies the JWT against `options.secret`/`options.algorithm`; on a cookie-based hit, re-signs and refreshes the cookie (sliding session — every authenticated request extends `sessionMaxAgeSeconds`).

```ts
const auth = new JwtCookieAuthController({ secret: process.env.JWT_SECRET!, secureCookies: isProd });
app.with(auth);
app.use("/admin/*", auth.authMiddleware);

// in a login handler:
await auth.setupCookieSession(c, { userId: user.id, role: user.role });

// in a logout handler:
auth.revoke(c);
```

`requireRoles(allowed)` is exactly `this.guard((identity) => canAccess(identity.role, allowed))` — this preset's own convenience on top of the generic `guard()`, not something every paradigm gets for free.

## `AuthIdentity`

```ts
interface AuthIdentity extends Record<string, unknown> {}
```

Declared in `registry.ts`, deliberately unconstrained — no mandated `role` field. Augment it via declaration merging to get app-wide typing:

```ts
declare module "@donilite/wrap" {
  interface WrapRegistry {
    identity: { userId: string; role: UserRoles; tenantId: string };
  }
}
```

See [Registry](registry.md#appvariables--authidentity--approles).
