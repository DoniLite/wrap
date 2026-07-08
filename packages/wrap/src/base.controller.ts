/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { BaseService } from './base.service';
import { logger } from './logger';
import type { AppVariables } from './registry';
import {
  getControllerMetadata,
  getRouteMetadata,
  getMiddlewareMetadata,
  getCacheMetadata,
  getRateLimitMetadata,
  getSerializeMetadata,
  joinPath,
  recordControllerMount,
} from './decorators';
import { cacheMiddleware } from './middleware/cache.middleware';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware';
import { serialize } from './middleware/serialize.middleware';
import { mapErrorToResponse } from './middleware/error-handler.middleware';

export interface RouteMiddlewares {
  all?: MiddlewareHandler<{ Variables: AppVariables }>[];
  [key: `${string}`]:
    | MiddlewareHandler<{ Variables: AppVariables }>[]
    | undefined;
}

export interface ControllerOptions {
  middlewares?: RouteMiddlewares;
  excludeRoutes?: string[];
}

export interface RegisterOptions {
  /** Prefixed in front of the child's own `@Controller({ basePath })`. */
  prefix?: string;
  /**
   * Middleware scoped to this mount — applied on the PARENT app, before
   * `.route()` attaches the child, so it wraps every request the child
   * handles (including its bare mount path) regardless of when the
   * child's own routes were registered. Not the same as putting
   * middleware inside the child controller itself, which only guards
   * that controller's own routes, not further children it composes.
   */
  middlewares?: MiddlewareHandler<{ Variables: AppVariables }>[];
}

/** Shared by `Wrap.register()` and `RouterController.register()`. */
export function mountController(
  app: Hono<{ Variables: AppVariables }>,
  mountPath: string,
  childApp: Hono<{ Variables: AppVariables }>,
  middlewares?: MiddlewareHandler<{ Variables: AppVariables }>[],
): void {
  if (middlewares?.length) {
    const scopedPath = mountPath === '/' ? '*' : `${mountPath}/*`;
    for (const middleware of middlewares) {
      app.use(scopedPath, middleware);
    }
  }
  app.route(mountPath, childApp);
}

/**
 * Route-scanning base for any Hono-mounted controller — decorated-route
 * registration, middleware assembly and error handling, with no service
 * or repository attached. Use this directly for controllers that aren't
 * backed by an entity (health checks, aggregation/root routes, ...).
 * `class IndexController extends RouterController {}`
 */
export abstract class RouterController {
  protected app: Hono<{ Variables: AppVariables }>;
  protected options: ControllerOptions;
  protected logger = logger;

  constructor(
    app: Hono<{ Variables: AppVariables }>,
    options: ControllerOptions = {},
  ) {
    this.app = app;
    this.options = {
      middlewares: options.middlewares || {},
      excludeRoutes: options.excludeRoutes || [],
    };

    this.registerRoutes();
  }

  // ... (methods) ...

  /**
   * Handle errors in a consistent way — shares its mapping with the
   * global `errorHandler()` (app.onError), so both circuits answer
   * with the same shape.
   */
  protected handleError(
    c: Context<{ Variables: AppVariables }>,
    error: unknown,
  ) {
    return mapErrorToResponse(c, error, { className: this.constructor.name });
  }

  protected registerCustomRoutes(): void {}

  /**
   * Register all routes (standard CRUD and decorated)
   */
  private registerRoutes(): void {
    // Register decorated routes (this now includes standard CRUD methods as they are decorated)
    this.registerDecoratedRoutes();

    this.registerCustomRoutes();
  }

  /**
   * Scan and register methods decorated with @Route, @Get, etc.
   */
  private registerDecoratedRoutes() {
    const { middlewares = {}, excludeRoutes = [] } = this.options;

    // Get all methods of the instance (searching prototype chain)
    const prototype = Object.getPrototypeOf(this);
    const methodNames = Object.getOwnPropertyNames(prototype).filter(
      (name) =>
        name !== 'constructor' && typeof (this as any)[name] === 'function',
    );

    for (const methodName of methodNames) {
      // Check for exclusion (e.g. if methodName is "list" and it's in excludeRoutes)
      if (excludeRoutes.includes(methodName as any)) {
        this.logger.debug(
          `Skipping excluded route: ${this.constructor.name}.${methodName}`,
        );
        continue;
      }

      // Get route metadata
      const routes = getRouteMetadata(this.constructor) || [];

      const methodRoutes = routes.filter(
        (r) => (r as any).handler === methodName,
      );

      for (const route of methodRoutes) {
        if (!route.method) continue;

        const path = route.path || '/';
        const method = route.method.toLowerCase() as
          | 'get'
          | 'post'
          | 'put'
          | 'patch'
          | 'delete';

        // --- Middleware Assembly ---
        const allMiddlewares: MiddlewareHandler<{ Variables: AppVariables }>[] =
          [];

        // 1. Global Middlewares (from options)
        if (middlewares.all) {
          allMiddlewares.push(...middlewares.all);
        }

        // 2. Method-Type Based Middlewares (from options e.g. middlewares.get)
        const methodTypeMiddlewares = middlewares[method];
        if (methodTypeMiddlewares) {
          allMiddlewares.push(...methodTypeMiddlewares);
        }

        // 3. Method-Name Based Middlewares (from options e.g. middlewares.list)
        // Note: RouteMiddlewares type definition allows [key: string]: ... so we can access by methodName
        const namedMiddlewares = middlewares[methodName];
        if (namedMiddlewares) {
          allMiddlewares.push(...namedMiddlewares);
        }

        // 4. Decorator Middlewares (@UseMiddleware)
        const decoratorMiddlewares =
          getMiddlewareMetadata(prototype, methodName) || [];
        allMiddlewares.push(...decoratorMiddlewares);

        // 5. Cache Decorator
        const cacheOptions = getCacheMetadata(prototype, methodName);
        if (cacheOptions) {
          allMiddlewares.push(cacheMiddleware(cacheOptions));
        }

        // 6. Rate Limit Decorator
        const rateLimitOptions = getRateLimitMetadata(prototype, methodName);
        if (rateLimitOptions) {
          allMiddlewares.push(rateLimitMiddleware(rateLimitOptions));
        }

        // Bind handler to this instance
        const originalHandler = (this as any)[methodName].bind(this);

        // 7. Serialize Decorator - wrap handler to transform response
        const serializeOptions = getSerializeMetadata(prototype, methodName);
        const handler = serializeOptions
          ? async (c: Context<{ Variables: AppVariables }>) => {
              const response = await originalHandler(c);

              // If no response returned (e.g., error handler didn't return), pass through
              if (!response) {
                return response;
              }

              // If response is a Hono Response, extract and transform the JSON body
              if (response instanceof Response) {
                const contentType = response.headers.get('content-type');
                const { status } = response;

                // Only serialize successful JSON responses (2xx status codes)
                if (
                  contentType?.includes('application/json') &&
                  status >= 200 &&
                  status < 300
                ) {
                  const body = await response.json();
                  const transformed = serialize(body, {
                    dto: serializeOptions.dto,
                    isArray: serializeOptions.isArray,
                  });
                  return c.json(transformed, status as any);
                }
                return response;
              }
              return response;
            }
          : originalHandler;

        // Register route with Hono (spread defeats hono's variadic
        // overload resolution, hence the cast)
        (this.app[method] as (path: string, ...handlers: unknown[]) => unknown)(
          path,
          ...allMiddlewares,
          handler,
        );

        this.logger.debug(
          `Registered decorated route: ${method.toUpperCase()} ${path} -> ${this.constructor.name}.${methodName} with ${allMiddlewares.length} middlewares${serializeOptions ? ` [Serialize: ${serializeOptions.dto.name}]` : ''}`,
        );
      }
    }
  }

  /**
   * Get the Hono app instance
   */
  public getApp(): Hono<{ Variables: AppVariables }> {
    return this.app;
  }

  /**
   * Mount a child controller at the path declared by its
   * `@Controller({ basePath })` decorator (optionally prefixed) — the same
   * composition primitive `Wrap.register()` uses at the top level, so any
   * controller can compose child controllers under itself (parent → children).
   */
  public register<C extends RouterController>(
    ControllerClass: new () => C,
    options?: string | RegisterOptions,
  ): this {
    const { prefix, middlewares } =
      typeof options === 'string'
        ? { prefix: options, middlewares: undefined }
        : (options ?? {});
    const instance = new ControllerClass();
    const metadata = getControllerMetadata(ControllerClass);
    const mountPath = joinPath(prefix ?? '', metadata?.basePath ?? '');
    recordControllerMount(ControllerClass, mountPath, this.constructor);
    mountController(this.app, mountPath, instance.getApp(), middlewares);
    return this;
  }
}

/**
 * Generic CRUD controller. Everything is derived from the service type:
 * `class ExampleController extends BaseController<ExampleService> {}`
 */
export abstract class BaseController<
  Service extends BaseService<any, any, any> = BaseService<any, any, any>,
> extends RouterController {
  protected service: Service;

  constructor(
    service: Service,
    app: Hono<{ Variables: AppVariables }>,
    options: ControllerOptions = {},
  ) {
    super(app, options);
    this.service = service;
  }
}
