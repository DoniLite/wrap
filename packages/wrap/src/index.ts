/**
 * @donilite/wrap — OOP backend framework on Hono + Drizzle, Bun-first.
 *
 * Vertical-slice architecture: entities, repositories, services and
 * controllers are defined per feature; the drizzle table (built by the
 * Entity factory) is the single source of truth for typing, validation
 * and OpenAPI.
 */
import "reflect-metadata";

// App registry (declaration merging point)
export * from "./registry";

// Entities
export * from "./entity";

// Database lifecycle
export * from "./database";

// Transactions (implicit AsyncLocalStorage propagation)
export * from "./transaction";

// Entity lifecycle events
export * from "./events";

// Base classes
export * from "./base.repository";
export * from "./base.service";
export * from "./base.controller";

// DTOs (zod-backed)
export * from "./dto";

// Types
export * from "./types/base";
export * from "./types/pagination";

// Decorators (@Controller, @Get, @Repository, @Service, @DTO, @Cache, ...)
export * from "./decorators";

// Middlewares
export * from "./middleware/cache.middleware";
export * from "./cache/redis-cache.store";
export * from "./middleware/rate-limit.middleware";
export * from "./middleware/error-handler.middleware";
export * from "./middleware/request-logger.middleware";
export * from "./middleware/serialize.middleware";
export * from "./middleware/auth/auth.middleware";

// OpenAPI / Swagger UI
export * from "./swagger";

// Storage providers
export * from "./storage";

// Helpers
export * from "./helpers/response.helper";
export { default as buildQuery } from "./helpers/buildQuery.helper";
export * from "./helpers/validator.helper";
export * from "./helpers/hash.helper";
export * from "./helpers/image.helper";
export * from "./helpers/updates.helper";
export * from "./helpers/database.helper";

// Seeders
export * from "./seeders/base.seed";
export * from "./seeders/runner";

// Factories
export * from "./factory/service.factory";

// Logger
export * from "./logger";
