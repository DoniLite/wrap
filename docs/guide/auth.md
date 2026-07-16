---
title: Auth
parent: Guides
nav_order: 2
---

## `AuthController` is paradigm-agnostic

The framework doesn't ship one auth system with configuration knobs — it ships a contract, `AuthController`, that any paradigm (JWT + cookie, DB-backed sessions, API keys, OAuth token introspection, magic links, ...) implements:

```ts
abstract class AuthController {
  abstract authenticate(c: Context): Promise<AuthIdentity | null>;
  abstract revoke(c: Context): Promise<void> | void;
  abstract openApiSecurityScheme(): OpenApiSecuritySchemes;

  authMiddleware: MiddlewareHandler;              // generic — implemented once, here
  guard(predicate: (identity) => boolean): MiddlewareHandler; // generic authorization
  static combine(...controllers: AuthController[]): AuthController;
}
```

Only `authenticate()`, `revoke()`, and `openApiSecurityScheme()` are paradigm-specific and must be implemented by a subclass — all three are `abstract`, all three are mandatory (an un-overridden `openApiSecurityScheme()` used to silently produce empty/misleading Swagger docs; making it abstract forces every preset to declare how a client actually authenticates). `authMiddleware` and `guard()` are identical for every paradigm, so they're implemented once on the base class. Full signatures: [API reference — Auth](../api/auth.md).

## No forced RBAC

There is no role concept baked into the base contract. `guard(predicate)` takes an arbitrary predicate over whatever `authenticate()` resolved — permission-based, scope-based, tenant-based, or role-based checks are all equally first-class:

```ts
app.get("/admin", auth.authMiddleware, auth.guard((identity) => identity.role === "admin"), handler);
```

A preset that *wants* a role-based convenience adds its own on top — `JwtCookieAuthController.requireRoles(allowed)` is exactly `this.guard((identity) => canAccess(identity.role, allowed))`, not a framework mandate. Write your own convenience the same way for your own paradigm if you want one.

## The identity shape is yours to type

`c.get("identity")` is whatever `authenticate()` returned — free-form (`Record<string, unknown>`) unless the app augments `WrapRegistry.identity`:

```ts
declare module "@donilite/wrap" {
  interface WrapRegistry {
    identity: { userId: string; role: UserRoles; tenantId: string };
  }
}
```

Once augmented, `c.get("identity")` is typed everywhere in the app automatically — same declaration-merging mechanism as `schema`/`variables`/`roles`.

## The shipped preset: `JwtCookieAuthController`

Bearer token or session cookie, verified against a shared JWT secret. Sessions slide — every authenticated request re-signs and refreshes the cookie.

```ts
const auth = new JwtCookieAuthController({ secret: process.env.JWT_SECRET!, secureCookies: isProd });
app.with(auth); // makes it available to app.swagger() for security schemes; NOT auto-applied globally
app.use("/admin/*", auth.authMiddleware); // apply explicitly wherever needed
```

`auth.setupCookieSession(c, { userId, role })` after a successful login signs and sets the cookie; `auth.revoke(c)` (or its `clearCookieSession` alias) clears it. Full option list: [API reference — Auth](../api/auth.md#jwtcookieauthcontroller).

## Writing your own paradigm

Constructor-inject a repository/service freely — `AuthController` isn't restricted to stateless verification, and a DB-backed session preset participates in the same entity/event/transaction machinery as the rest of the app:

```ts
class DbSessionAuthController extends AuthController {
  constructor(private sessions: SessionRepository) { super(); }

  async authenticate(c: Context) {
    const token = getCookie(c, "session");
    if (!token) return null;
    const session = await this.sessions.findOneBy("token", token);
    return session ? { userId: session.userId, role: session.role } : null;
  }

  async revoke(c: Context) {
    const token = getCookie(c, "session");
    if (token) await this.sessions.applyBatch([{ op: "delete", id: token, updatedAt: new Date() }]);
    deleteCookie(c, "session");
  }

  openApiSecurityScheme() {
    return { cookieAuth: { type: "apiKey", in: "cookie", name: "session" } };
  }
}
```

## Combining paradigms: `AuthController.combine()`

Mix strategies in the same app — e.g. cookie sessions for browser requests, falling back to an API-key controller for clients that can't store cookies:

```ts
const auth = AuthController.combine(cookieAuth, apiKeyAuth);
app.with(auth);
```

Each delegate's `authenticate()` is tried in order; the first non-null identity wins. `revoke()` runs on every delegate (best-effort — the same "safe no-op when there's nothing to clear" contract every preset's own `revoke()` already needs). `openApiSecurityScheme()` merges every delegate's schemes. Delegates can come from entirely separate (even third-party) packages — combining only needs the public `AuthController` contract.

## Swagger integration

`app.swagger(...)` reads whatever `AuthController` was registered via `.with()`: its `openApiSecurityScheme()` becomes `components.securitySchemes` in the generated spec, and any route guarded by `authMiddleware`/`guard()` (detected via an internal tag, not by sniffing function names) gets a `security` requirement + a `401` response added automatically. See [Swagger](swagger.md).
