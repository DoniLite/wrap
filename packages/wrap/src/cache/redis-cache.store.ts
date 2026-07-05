/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Redis cache backend on Bun's native RedisClient — zero dependency.
 * The Bun global is only touched at construction time (app bootstrap),
 * so the package stays loadable under Node.
 */
import type { CacheStore } from "../middleware/cache.middleware";

export interface RedisCacheStoreOptions {
  /** redis:// connection string (default: Bun's REDIS_URL / localhost). */
  url?: string;
  /** Prefix applied to every key (default: none). */
  namespace?: string;
}

type BunRedis = InstanceType<typeof Bun.RedisClient>;

export class RedisCacheStore implements CacheStore {
  private client: BunRedis;
  private namespace: string;

  constructor(options: RedisCacheStoreOptions = {}) {
    if (typeof Bun === "undefined") {
      throw new Error("RedisCacheStore requires the Bun runtime");
    }
    this.client = options.url
      ? new Bun.RedisClient(options.url)
      : (Bun.redis as BunRedis);
    this.namespace = options.namespace ?? "";
  }

  private key(key: string): string {
    return `${this.namespace}${key}`;
  }

  async get(key: string): Promise<any | null> {
    const raw = await this.client.get(this.key(key));
    if (raw === null || raw === undefined) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  async set(key: string, value: any, ttl: number = 300): Promise<void> {
    const namespaced = this.key(key);
    await this.client.set(namespaced, JSON.stringify(value));
    await this.client.expire(namespaced, ttl);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.key(key));
  }

  async deletePrefix(prefix: string): Promise<void> {
    await this.scanAndDelete(`${this.key(prefix)}*`);
  }

  async clear(): Promise<void> {
    // Only clears our own keys (never FLUSHDB — the db may be shared)
    await this.scanAndDelete(`${this.namespace}wrap:cache:*`);
    if (this.namespace) {
      await this.scanAndDelete(`${this.namespace}*`);
    }
  }

  /** Close the underlying connection (tests / graceful shutdown). */
  close(): void {
    this.client.close();
  }

  private async scanAndDelete(pattern: string): Promise<void> {
    let cursor = "0";
    do {
      const [next, keys] = (await this.client.send("SCAN", [
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        "200",
      ])) as [string, string[]];
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      cursor = next;
    } while (cursor !== "0");
  }
}
