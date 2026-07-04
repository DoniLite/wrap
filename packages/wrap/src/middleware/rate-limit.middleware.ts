import type { Context, Next } from "hono";
import type { getConnInfo as GetConnInfo } from "hono/bun";

/**
 * Pluggable rate-limit store — the memory implementation is the default;
 * provide your own (e.g. Redis) through the middleware options.
 */
export interface RateLimitStore {
  increment(
    key: string,
    window: number,
  ): Promise<{ count: number; resetAt: number }>;
  reset(key: string): Promise<void>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; resetAt: number }>();

  async increment(
    key: string,
    window: number,
  ): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const item = this.store.get(key);

    if (!item || now > item.resetAt) {
      const fresh = { count: 1, resetAt: now + window * 1000 };
      this.store.set(key, fresh);
      return fresh;
    }

    item.count++;
    return item;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export const defaultRateLimitStore = new MemoryRateLimitStore();

// hono/bun references the Bun global at load time — import it lazily so
// the package stays loadable under Node (e.g. by drizzle-kit).
let getConnInfo: typeof GetConnInfo | undefined;

/** Real client IP: proxy headers first, then Bun's connection info. */
async function clientIdentifier(c: Context): Promise<string> {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = c.req.header("x-real-ip");
  if (realIp) return realIp;
  try {
    if (typeof Bun === "undefined") return "anonymous";
    getConnInfo ??= (await import("hono/bun")).getConnInfo;
    return getConnInfo(c).remote.address ?? "anonymous";
  } catch {
    return "anonymous";
  }
}

export interface RateLimitMiddlewareOptions {
  max: number;
  /** Window in seconds */
  window: number;
  message?: string;
  /** Rate-limit backend (default: in-memory). */
  store?: RateLimitStore;
  /** Custom identifier (default: client IP). */
  keyGenerator?: (c: Context) => string | Promise<string>;
}

export function rateLimitMiddleware(options: RateLimitMiddlewareOptions) {
  const {
    max,
    window,
    message = "Too many requests",
    store = defaultRateLimitStore,
    keyGenerator = clientIdentifier,
  } = options;

  return async (c: Context, next: Next) => {
    const key = `rate-limit:${await keyGenerator(c)}:${c.req.path}`;

    const { count, resetAt } = await store.increment(key, window);

    // Set rate limit headers
    c.header("X-RateLimit-Limit", max.toString());
    c.header("X-RateLimit-Remaining", Math.max(0, max - count).toString());
    c.header("X-RateLimit-Reset", Math.ceil(resetAt / 1000).toString());

    if (count > max) {
      return c.json(
        {
          error: message,
          retryAfter: Math.max(0, Math.ceil((resetAt - Date.now()) / 1000)),
        },
        429,
      );
    }

    return next();
  };
}
