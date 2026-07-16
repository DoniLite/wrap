---
title: Swagger / OpenAPI
parent: Guides
nav_order: 4
---

No separate OpenAPI authoring — the spec is generated entirely from decorator metadata plus the registered `AuthController`.

## Enabling it

```ts
app.swagger({ title: "My API", version: "1.0.0", path: "/docs" /* default */ }, uiOptions?);
```

Serves the interactive UI at `path` and the raw spec at `${path}/openapi.json`. When an `AuthController` was registered via `.with()`, the UI defaults to `withCredentials: true` and `persistAuthorization: true` so cookie-session "Try it out" and the standard bearer "Authorize" button both work without extra config; pass `uiOptions` to override.

## Path resolution follows the real mount, not just `@Controller.basePath`

A controller's `@Controller({ basePath })` is only the whole story when it's registered directly on `Wrap` with no prefix. Once controllers compose each other (`this.register(Child, { prefix })`), the actual runtime path also depends on the prefix and the parent chain — `SwaggerGenerator` resolves this by walking the same registration record `register()` writes (`resolveControllerPath()`), so a route's documented path matches where it's actually mounted, not just its own decorator in isolation. A controller that was decorated but never registered anywhere falls back to its bare `basePath`.

## Path parameters are derived from the path itself

`:id` and Hono's regex-constrained `:id{[0-9]+}` are both picked up automatically and rendered as OpenAPI `{id}` path parameters — no need to redeclare them via `@Get({ params: {...} })` (that option still exists, and overrides the auto-derived type/description when set, but declaring the param at all is no longer required for it to show up).

## Security schemes come from the registered `AuthController`

```ts
class JwtCookieAuthController extends AuthController {
  openApiSecurityScheme(): OpenApiSecuritySchemes {
    return {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      cookieAuth: { type: "apiKey", in: "cookie", name: "session" },
    };
  }
}
```

This becomes `components.securitySchemes` in the generated spec. A route guarded by `authMiddleware`/`guard()` gets a `security` requirement referencing every scheme key, plus an auto-added `401` response — detected via an internal tag set once on the base `AuthController` class, not by sniffing middleware function names (which breaks on bound/wrapped functions). With no `AuthController` registered, a hardcoded `bearerAuth`/`cookieAuth` pair is used as the fallback.

## Tags: flat namespace, not hierarchical

An operation's tags come from its controller's `@Controller({ tags: [...] })` by default. **A route can override this per-operation** via `@Get({ tags: [...] })` (or the equivalent on any HTTP-verb decorator) — when set, it *replaces* (doesn't merge with) the controller's tags for that one operation.

**There is no tag nesting.** OpenAPI tags — and the stock `swagger-ui` this framework renders with (`@hono/swagger-ui`) — are a flat namespace: an operation with `tags: ["parent", "enfant"]` legitimately appears under *both* the "parent" and "enfant" sections, not nested as "parent › enfant". ReDoc has a vendor extension (`x-tagGroups`) for visual nesting in its own sidebar, but that's ReDoc-specific, not part of the OpenAPI spec, and not rendered here. The practical workaround for a hierarchical *look* within the flat model: name tags with a convention, e.g. `"Parent"` and `"Parent: Child"` — alphabetically adjacent, unambiguous, without claiming a nesting the spec doesn't have. Use the per-route `tags` override to give a child controller's routes their own tag identity when you want this.

## `SwaggerConfig.tags` descriptions

```ts
app.swagger({
  title, version,
  tags: [{ name: "Foos", description: "Everything about foos" }],
});
```

A config entry's `description` is merged into the generated tag list by matching `name` against whatever tags controllers/routes actually declared — a tag with no matching config entry falls back to a bare `{ name }`.

Full API: [Swagger reference](../api/swagger.md).
