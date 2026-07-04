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
