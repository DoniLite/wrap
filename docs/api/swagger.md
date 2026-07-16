---
title: Swagger
parent: API reference
nav_order: 8
---

`packages/wrap/src/swagger/index.ts`. See also: [Swagger guide](../guide/swagger.md).

## `SwaggerConfig`

```ts
interface SwaggerConfig {
  title: string;
  version: string;
  description?: string;
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>; // descriptions for tags used anywhere in the app
}
```

## `new SwaggerGenerator(config, auth?)`

```ts
class SwaggerGenerator {
  constructor(config: SwaggerConfig, auth?: AuthController);
  generateSpec(): OpenAPISpec;
  setupSwaggerUI(app: Hono, swaggerPath?: string, uiOptions?: Partial<SwaggerUIOptions>): Hono;
}
```

`auth` — an `AuthController` instance (including a [`combine()`](auth.md#static-combinecontrollers)'d one) whose `openApiSecurityScheme()` drives `components.securitySchemes`. Omitted, the spec falls back to `DEFAULT_SECURITY_SCHEMES` (`bearerAuth` + `cookieAuth`, matching `JwtCookieAuthController`'s own defaults) — mostly relevant if you call `SwaggerGenerator` directly instead of through `Wrap.swagger()`, which always passes whatever was registered via `.with()`.

### `generateSpec()`

Walks every class registered via `@Controller` (`getAllControllers()`), builds one OpenAPI `paths` entry per `@Get`/`@Post`/etc.-decorated method, and returns an `openapi: "3.0.0"` document. Behavior worth knowing:

#### Path resolution

```ts
const basePath = resolveControllerPath(ControllerClass) ?? controllerMetadata.basePath;
```

Uses the controller's *actual* mount path — the prefix and parent chain built up at runtime by every `Wrap.register()`/`RouterController.register()` call (see [Decorators — controller mount tracking](decorators.md#controller-mount-tracking)) — not just the bare `@Controller({ basePath })`. Falls back to the bare `basePath` only if the controller was never actually registered anywhere (decorated but unused).

#### Path parameters

```ts
function extractPathParamNames(path: string): string[]
```

Path params (`operation.parameters` with `in: "path"`) are derived directly from the route's path string — both `:id` and `:id{[0-9]+}` (Hono's regex-constrained param syntax) are recognized, and `normalizePath()` strips the `{...}` constraint before the OpenAPI-style `{id}` conversion so a constrained param doesn't render as `{id{[0-9]+}}`. An explicit `route.params[name]` entry (see [`RouteOptions.params`](decorators.md#route-decorators--get--post--put--patch--delete)) only overrides `type`/`description` for a param that's already been auto-derived — it does not declare params that don't already appear in the path.

#### Request/response bodies

`route.body` becomes `requestBody` for `post`/`put`/`patch` — either a `multipart/form-data` schema (when `route.body.type === "multipart/form-data"`, file fields get `{ type: "string", format: "binary" }`) or a `$ref` to the body DTO's generated schema. `@ApiResponse(status, options)` metadata (see [Decorators](decorators.md#apiresponsestatus-options--apitagstags)) merges with any `route.responses` (the latter taking priority on conflicts); a default `200` is added if no `2xx` response was declared, and a default `400` (validation-error shape) is always added if not already present.

#### Security detection

```ts
const hasAuthMiddleware = middlewares.some((mw) => Boolean(mw?.[WRAP_AUTH_MIDDLEWARE]));
```

A route is marked as requiring auth (`operation.security` populated from every key in `securitySchemes`, plus a default `401` response) by checking whether any middleware recorded on that method (via `@UseMiddleware`, `@Can`, or an `AuthController`'s own `authMiddleware`) carries the `WRAP_AUTH_MIDDLEWARE` brand — see [Auth — branding](auth.md#branding-wrap_auth_controller--wrap_auth_middleware). Not name-sniffing, so it survives bound/wrapped functions and duplicated module instances.

#### Tags

```ts
const operationTags = route.tags?.length ? route.tags : controllerTags ?? [];
```

A route's own `tags` (see [Decorators — `@Get`/etc.](decorators.md#route-decorators--get--post--put--patch--delete)) **replaces** the controller's tags for that one operation — it does not merge. `config.tags` entries are matched by name against every tag that actually appears anywhere in the generated spec, supplying a `description`; an appearing tag with no matching `config.tags` entry falls back to `{ name }` with no description.

OpenAPI/stock swagger-ui tags are a **flat namespace** — there is no parent/child relationship in the spec. An operation with `tags: ["Parent", "Child"]` legitimately appears under *both* sections, it does not render as "Parent > Child". ReDoc has a vendor extension (`x-tagGroups`) for visual nesting, but it's ReDoc-only, not part of the OpenAPI spec, and not rendered by `@hono/swagger-ui` (stock `swagger-ui-dist`, what this framework uses). The practical workaround within the flat model: name tags by convention — `"Parent"` and `"Parent: Child"` — visually adjacent under alphabetical sort, without claiming nesting the spec doesn't actually have. `RouteOptions.tags` is the lever that makes this possible per-route.

#### Schemas

`generateSchemas()` (private, called at the start of `generateSpec()`) converts every registered DTO's Zod schema (`getAllDTOs()`) to a JSON Schema via `z.toJSONSchema(schema, { target: "openapi-3.0", unrepresentable: "any", io: "input", override: /* Date -> {type:"string",format:"date-time"} */ })`, keyed by the DTO's registered name. A conversion failure warns to console and falls back to `{ type: "object" }` rather than throwing — one malformed DTO schema doesn't take down the whole spec.

### `setupSwaggerUI(app, swaggerPath?, uiOptions?)`

```ts
setupSwaggerUI(app: Hono, swaggerPath: string = "/docs", uiOptions?: Partial<SwaggerUIOptions>): Hono
```

Registers `GET ${swaggerPath}/openapi.json` (serves `generateSpec()`'s output as JSON) and `GET ${swaggerPath}` (renders `@hono/swagger-ui`'s `SwaggerUI({ url, ...uiOptions })`). `uiOptions` is forwarded as-is — `withCredentials`/`persistAuthorization` are the two that matter for cookie-session "Try it out" flows; `Wrap.swagger()` sets sensible defaults for both automatically when an `AuthController` is registered (see [Wrap — `.swagger()`](wrap.md#swaggerconfig-uioptions)).

## `setupSwagger(app, config, path?, options?)`

```ts
function setupSwagger(
  app: Hono,
  config: SwaggerConfig,
  path: string = "/docs",
  options?: { auth?: AuthController; ui?: Partial<SwaggerUIOptions> },
): Hono
```

Free-function shorthand: `new SwaggerGenerator(config, options?.auth).setupSwaggerUI(app, path, options?.ui)`. `Wrap.swagger()` is the higher-level entry point most apps use instead — this exists for setting up Swagger on a raw Hono app outside of `Wrap`.
