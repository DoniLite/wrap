/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import type { CacheOptions } from "./interfaces";
import { CACHE_METADATA } from "./constants";
import { getCacheStore } from "../middleware/cache.middleware";

export function getCacheMetadata(
  target: any,
  propertyKey: string,
): CacheOptions | undefined {
  return Reflect.getMetadata(CACHE_METADATA, target, propertyKey);
}

// ===== CACHE DECORATOR =====

/**
 * Cache decorator - caches method results
 * @example
 * @Cache({ ttl: 300, key: (args) => `user:${args[0]}` })
 * async findById(id: string) {}
 */
export function Cache(options: CacheOptions = {}) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(CACHE_METADATA, options, target, propertyKey);
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const { ttl = 300 } = options;

      const key = options.key
        ? typeof options.key === "function"
          ? options.key(args)
          : options.key
        : `${target.constructor.name}:${propertyKey}:${JSON.stringify(args)}`;

      // Try to get from cache
      try {
        const cached = await getCacheStore().get(key);
        if (cached !== null && cached !== undefined) {
          // console.debug(`Cache hit for ${key}`);
          return cached;
        }
      } catch (e) {
        console.warn(`Cache get error for ${key}:`, e);
      }

      // Execute original method
      const result = await originalMethod.apply(this, args);

      // Cache result if not undefined/null
      if (result !== undefined && result !== null) {
        try {
          await getCacheStore().set(key, result, ttl);
        } catch (e) {
          console.warn(`Cache set error for ${key}:`, e);
        }
      }

      return result;
    };

    return descriptor;
  };
}
