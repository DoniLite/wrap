/**
 * Unified error handling — a single mapper used by both the global
 * `app.onError()` handler and `BaseController.handleError`, so every
 * error leaves the API in the same shape.
 */
import { ValidationError } from "../decorators";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { logger, type LogContext } from "../logger";
import { ResponseHelper } from "../helpers/response.helper";
import type { Context, ErrorHandler } from "hono";

/** Map any thrown value to a consistent JSON response. */
export function mapErrorToResponse(
  c: Context,
  error: unknown,
  context: LogContext = {},
): Response {
  logger.error(
    "Request error",
    {
      method: c.req.method,
      path: c.req.path,
      ...context,
    },
    error,
  );

  // Validation failures (thrown by @ValidateDTO or DTO.from()) → 400
  if (error instanceof ValidationError) {
    return c.json(
      ResponseHelper.error("Validation failed", { errors: error.errors }),
      error.statusCode,
    );
  }
  if (error instanceof z.ZodError) {
    const errors = error.issues.map((issue) => ({
      property: issue.path.join("."),
      constraints: { [issue.code]: issue.message },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      value: (issue as any).input,
    }));
    return c.json(ResponseHelper.error("Validation failed", { errors }), 400);
  }

  if (error instanceof HTTPException) {
    return error.getResponse();
  }

  if (error instanceof Error) {
    if (error.message.includes("not found")) {
      return c.json(
        ResponseHelper.error(error.message, { name: error.name }),
        404,
      );
    }
    return c.json(
      ResponseHelper.error(error.message, { name: error.name }),
      500,
    );
  }

  return c.json(ResponseHelper.error("An unexpected error occurred"), 500);
}

/**
 * Global error handler — register it the Hono way:
 * `app.onError(errorHandler())`
 */
export function errorHandler(): ErrorHandler {
  return (error, c) => mapErrorToResponse(c, error);
}
