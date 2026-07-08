import { Hono } from 'hono';
import type { Handler, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import type { SwaggerUIOptions } from '@hono/swagger-ui';
import { mountController, RouterController, type RegisterOptions } from './base.controller';
import { getControllerMetadata, joinPath, recordControllerMount } from './decorators';
import { ResponseHelper } from './helpers/response.helper';
import { errorHandler } from './middleware/error-handler.middleware';
import { AuthController, isAuthController } from './middleware/auth/auth.controller';
import { requestLoggerMiddleware } from './middleware/request-logger.middleware';
import type { AppVariables } from './registry';
import { SwaggerGenerator, type SwaggerConfig } from './swagger';

export interface WrapOptions {
  cors?: Parameters<typeof cors>[0];
  /** Max request body size in bytes. Default 1MB. */
  bodyLimit?: number;
}

export interface WrapListenOptions {
  /** Forwarded to `Bun.serve({ websocket })` as-is — see `createRealtime()`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  websocket?: any;
}

type WrapMiddleware = MiddlewareHandler<{ Variables: AppVariables }>;
// Route methods accept both middleware and a terminal handler (which may
// return synchronously, unlike MiddlewareHandler which always returns a
// Promise since it's expected to call `next()`).
type WrapRouteHandler = WrapMiddleware | Handler<{ Variables: AppVariables }>;
type WrapMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Composition root: owns the Hono instance, global middlewares, error
 * handling, controller registration and swagger — the pieces every
 * generated project otherwise hand-wires in its entrypoint.
 *
 * ```ts
 * const app = new Wrap();
 * app.with(auth);
 * app.register(IndexController);
 * app.swagger({ title: "My API", version: "1.0.0" });
 * app.listen(3000);
 * ```
 *
 * `.get/.post/.put/.patch/.delete/.use` cover ad-hoc routes and
 * path-scoped middleware without a full Controller class; `.request()`
 * mirrors Hono's for direct testing. Anything still uncovered (websocket
 * upgrade, a custom `Bun.serve`, ...) stays reachable through `.raw`.
 */
export class Wrap {
  private app: Hono<{ Variables: AppVariables }>;
  private auth?: AuthController;

  constructor(options: WrapOptions = {}) {
    this.app = new Hono<{ Variables: AppVariables }>();

    this.extendDefaultsMiddleware(options);
  }

  protected extendDefaultsMiddleware(options: WrapOptions): void {
    this.app.use(requestId());
    this.app.use(secureHeaders());
    this.app.use(cors(options.cors ?? {}));
    this.app.use(bodyLimit({ maxSize: options.bodyLimit ?? 1024 * 1024 }));
    this.app.use(requestLoggerMiddleware());

    this.app.onError(errorHandler());
    this.app.notFound((c) =>
      c.json(
        ResponseHelper.error(`The path ${c.req.path} does not exist`),
        404,
      ),
    );
  }

  /**
   * Register a global middleware, or the app's `AuthController` — the
   * latter isn't applied globally (matches the common pattern of guarding
   * only specific route groups, e.g. `app.use("/admin/*", auth.authMiddleware)`);
   * it's made available to `.swagger()` for the generated spec's security
   * schemes.
   */
  with(pluginOrMiddleware: WrapMiddleware | AuthController): this {
    if (isAuthController(pluginOrMiddleware)) {
      this.auth = pluginOrMiddleware;
      return this;
    }
    this.app.use(pluginOrMiddleware);
    return this;
  }

  /**
   * Mount a controller at the path declared by its `@Controller({ basePath })`
   * decorator (optionally prefixed) — `basePath` becomes the single source
   * of truth for where the controller lives. Pass `{ middlewares }` to
   * guard the whole mount (e.g. `app.register(AdminController, { middlewares: [auth.authMiddleware] })`);
   * a plain string is shorthand for `{ prefix }`. The same primitive is
   * available on any `RouterController` (`this.register(...)`) so
   * controllers can compose child controllers under themselves, including
   * from within `registerCustomRoutes()`.
   */
  register<C extends RouterController>(
    ControllerClass: new () => C,
    options?: string | RegisterOptions,
  ): this {
    const { prefix, middlewares } =
      typeof options === 'string' ? { prefix: options, middlewares: undefined } : options ?? {};
    const instance = new ControllerClass();
    const metadata = getControllerMetadata(ControllerClass);
    const mountPath = joinPath(prefix ?? '', metadata?.basePath ?? '');
    // No parent: registered directly on Wrap, i.e. this IS the root of its
    // mount chain — see resolveControllerPath() in decorators/registries.ts.
    recordControllerMount(ControllerClass, mountPath);
    mountController(this.app, mountPath, instance.getApp(), middlewares);
    return this;
  }

  /**
   * Enable Swagger UI + OpenAPI spec. When an `AuthController` was
   * registered via `.with()`, its `openApiSecurityScheme()` drives the
   * generated security schemes, and the UI defaults to sending
   * credentials (cookie sessions) and persisting the "Authorize" state so
   * "Try it out" works out of the box.
   */
  swagger(
    config: SwaggerConfig & { path?: string },
    uiOptions?: Partial<SwaggerUIOptions>,
  ): this {
    const { path = '/docs', ...swaggerConfig } = config;
    const generator = new SwaggerGenerator(swaggerConfig, this.auth);
    const defaultUiOptions: Partial<SwaggerUIOptions> = this.auth
      ? { withCredentials: true, persistAuthorization: true }
      : {};

    generator.setupSwaggerUI(this.app, path, {
      ...defaultUiOptions,
      ...uiOptions,
    });
    return this;
  }

  /** Escape hatch to the underlying Hono instance (realtime upgrade, custom routes, ...). */
  get raw(): Hono<{ Variables: AppVariables }> {
    return this.app;
  }

  /** Fire a request straight at the app — mirrors `Hono.request()`, useful for tests. */
  get request(): Hono<{ Variables: AppVariables }>['request'] {
    return this.app.request.bind(this.app);
  }

  private route(method: WrapMethod, path: string, handlers: WrapRouteHandler[]): this {
    (this.app[method] as (path: string, ...handlers: unknown[]) => unknown)(
      path,
      ...handlers,
    );
    return this;
  }

  get<P extends `${string}`>(path: P, ...handlers: WrapRouteHandler[]): this {
    return this.route('get', path, handlers);
  }

  post<P extends `${string}`>(path: P, ...handlers: WrapRouteHandler[]): this {
    return this.route('post', path, handlers);
  }

  put<P extends `${string}`>(path: P, ...handlers: WrapRouteHandler[]): this {
    return this.route('put', path, handlers);
  }

  patch<P extends `${string}`>(path: P, ...handlers: WrapRouteHandler[]): this {
    return this.route('patch', path, handlers);
  }

  delete<P extends `${string}`>(path: P, ...handlers: WrapRouteHandler[]): this {
    return this.route('delete', path, handlers);
  }

  /** Path-scoped middleware — `app.use("/admin/*", auth.authMiddleware)`. */
  use<P extends `${string}`>(path: P, ...middlewares: WrapMiddleware[]): this {
    (this.app.use as (path: string, ...mw: unknown[]) => unknown)(
      path,
      ...middlewares,
    );
    return this;
  }

  listen(
    port: number,
    hostname?: string,
    options?: WrapListenOptions,
  ): ReturnType<typeof Bun.serve> {
    return Bun.serve({
      port,
      hostname,
      fetch: this.app.fetch,
      websocket: options?.websocket,
    });
  }
}
