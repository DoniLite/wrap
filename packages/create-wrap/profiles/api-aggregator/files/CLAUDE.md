# CLAUDE.md — {{APP_NAME}}

Scaffolded with `bunx @donilite/create-wrap@latest` (**api-aggregator** profile: no database, service-oriented — `WrapService`s that call out to upstream APIs, fronted by `RouterController`s, mainly to get typed routes + OpenAPI docs over data this app doesn't own). Full framework API reference: **[link the docs site here once deployed]**. See `README.md` for the getting-started walkthrough — this file is LLM-oriented guidance on top of it.

## What's different from the full-backend profile

No `src/db/`, no `drizzle.config.ts`, no `compose.yml`, no repositories, no entities — same shape as `lightweight-api`, but the reference feature (`src/features/aggregator/`) is built around calling an upstream HTTP API rather than authenticating a caller.

## Adding a feature — the pattern (see `src/features/aggregator/`)

1. **DTOs** (`DTO/<name>.dto.ts`): a response shape (`SchemaDTO(...)` describing what you return) **and** a request shape for anything a caller supplies (`CheckUpstreamRequestDTO` in the reference feature) — the request DTO is what `@ValidateDTO()` validates against.
2. **Service** (`services/<name>.service.ts`): `@Service() class FooService extends WrapService { constructor(private readonly fetchImpl: typeof fetch = fetch) { super(); } ... }`. Inject `fetch` (or an SDK client) as a constructor param, defaulting to the real one — that's what makes it stubbable in tests without a live network call (see `tests/wrap.test.ts`). **Same `@Service()` + `@ValidateDTO()` convention as an entity-backed `BaseService`**: decorate the class, and decorate any method that takes caller-supplied input (not a caller-*controlled* value like `appConfig.externalApi.baseUrl` — nothing to validate there) with `@ValidateDTO()`. `AggregatorService.checkUpstream()` vs `AggregatorService.probe()` in the reference feature is exactly this split — follow it.
3. **Controller** (`web/<name>.controller.ts`): `@Controller({ basePath: "/foos" }) class FooController extends RouterController { constructor() { super(webFactory.createApp()); } ... }`.
4. Register it: `this.register(FooController)` in `src/index.controller.ts`'s constructor.

## Config

Upstream base URLs belong in `src/config/app.config.ts` (see `externalApi.baseUrl`), not hardcoded in a service — add one entry per upstream you front, or a map if there are several.

## Testing

No `createTestDatabase` in this profile's tests. Stub the injected `fetch` (don't hit real upstreams from a test) and drive HTTP-level assertions with `requestJson(app.raw, method, path, body?)` through a real `Wrap` + `IndexController` composition, same as `lightweight-api`.
