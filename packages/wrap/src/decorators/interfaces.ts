// ===== INTERFACES =====
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RepositoryOptions {
  tableName: string;
  cache?: boolean;
  cacheTTL?: number;
}

export interface ServiceOptions {
  name?: string;
  singleton?: boolean;
}

export interface ControllerDecoratorOptions {
  basePath: string;
  middleware?: any[];
  tags?: string[];
  description?: string;
}

export interface RouteOptions {
  path?: string;
  method?: "get" | "post" | "patch" | "put" | "delete";
  middleware?: any[];
  description?: string;
  summary?: string;
  responses?: Record<number, { description: string; schema?: any }>;
  body?: any;
  params?: Record<string, { type: string; description?: string }>;
  query?: Record<string, { type: string; description?: string }>;
  deprecated?: boolean;
  handler?: string;
  /**
   * OpenAPI tags for this specific route — when present, REPLACES (not
   * merges with) the owning controller's `@Controller({ tags })` for this
   * operation only. Lets a child controller's routes carry their own tag
   * identity distinct from routes that should stay under the parent's tag.
   * See the tag-nesting note in `swagger/index.ts`'s `generateSpec()` for
   * why this is a flat-namespace lever, not real nesting.
   */
  tags?: string[];
}

export interface CacheOptions {
  ttl?: number; // seconds
  key?: string | ((args: any[]) => string);
  invalidateOn?: string[]; // method names that invalidate this cache
}

export interface RateLimitOptions {
  max: number; // max requests
  window: number; // time window in seconds
  message?: string;
}
