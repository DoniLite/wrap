/**
 * Request logging middleware — correlates with hono's requestId()
 * middleware when it is registered before this one.
 */
import { logger } from "../logger";
import type { Context, Next } from "hono";

export function requestLoggerMiddleware() {
  return async (c: Context, next: Next) => {
    const start = performance.now();
    const method = c.req.method;
    const path = c.req.path;
    const requestId = c.get("requestId") as string | undefined;

    logger.info(`→ ${method} ${path}`, {
      method,
      path,
      requestId,
      userAgent: c.req.header("user-agent"),
    });

    await next();

    const duration = Math.round(performance.now() - start);
    const status = c.res.status;

    logger.info(`← ${method} ${path} ${status} (${duration}ms)`, {
      method,
      path,
      status,
      duration,
      requestId,
    });
  };
}
