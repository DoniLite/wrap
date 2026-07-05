/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Context, Next } from "hono";
import { onEntityEvent } from "../events";

/**
 * Pluggable cache store — the memory implementation is the default;
 * swap it for Redis (RedisCacheStore) or your own via configureCache().
 */
export interface CacheStore {
  get(key: string): Promise<any | null>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Delete every key starting with the prefix (entity-scope invalidation). */
  deletePrefix(prefix: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryCacheStore implements CacheStore {
  private cache = new Map<string, { value: any; expiry: number }>();

  async get(key: string): Promise<any | null> {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  async set(key: string, value: any, ttl: number = 300): Promise<void> {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async deletePrefix(prefix: string): Promise<void> {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}

export const defaultCacheStore = new MemoryCacheStore();

let activeStore: CacheStore = defaultCacheStore;

export interface CacheConfig {
  /** Cache backend for the whole app (default: in-memory). */
  store?: CacheStore;
}

/**
 * Configure the app-wide cache backend — call at bootstrap:
 * `configureCache({ store: new RedisCacheStore({ url }) })`
 */
export function configureCache(config: CacheConfig): CacheStore {
  if (config.store) activeStore = config.store;
  return activeStore;
}

/** The active cache backend (used by @Cache, cacheMiddleware and repositories). */
export function getCacheStore(): CacheStore {
  return activeStore;
}

/** Key prefix of the automatic entity-scope cache. */
export function entityCachePrefix(table: string): string {
  return `wrap:cache:${table}:`;
}

// Entity-scope invalidation: any write on an entity wipes its cache keys.
onEntityEvent("*", (event) => {
  void activeStore.deletePrefix(entityCachePrefix(event.table)).catch(() => {
    // invalidation is best-effort; a failure only means a stale TTL'd entry
  });
});

export interface CacheMiddlewareOptions {
  ttl?: number;
  keyGenerator?: (c: Context) => string;
  /** Cache backend override (default: the configured app-wide store). */
  store?: CacheStore;
}

export function cacheMiddleware(options: CacheMiddlewareOptions = {}) {
  const { ttl = 300, keyGenerator } = options;

  return async (c: Context, next: Next) => {
    const store = options.store ?? getCacheStore();
    // Only cache GET requests
    if (c.req.method !== "GET") {
      return next();
    }

    const cacheKey = keyGenerator
      ? keyGenerator(c)
      : `${c.req.method}:${c.req.path}:${JSON.stringify(c.req.query())}`;

    // Try to get from cache
    const cached = await store.get(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    // Continue to handler
    await next();

    // Cache the response
    if (c.res.status === 200) {
      try {
        const body = await c.res.clone().json();
        await store.set(cacheKey, body, ttl);
      } catch (e) {
        // Response might not be JSON, skip caching
        console.error("Failed to cache response:", e);
      }
    }
  };
}
