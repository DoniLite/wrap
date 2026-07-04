/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import type { ControllerDecoratorOptions, RouteOptions } from "./interfaces";
import {
  CONTROLLER_METADATA,
  ROUTE_METADATA,
  MIDDLEWARE_METADATA,
} from "./constants";
import { CONTROLLER_CLASSES } from "./registries";
import type { MiddlewareHandler } from "hono";

// ===== UTILITY FUNCTIONS =====

export function getControllerMetadata(
  target: any,
): ControllerDecoratorOptions | undefined {
  return Reflect.getMetadata(CONTROLLER_METADATA, target);
}

export function getRouteMetadata(target: any): RouteOptions[] | undefined {
  return Reflect.getMetadata(ROUTE_METADATA, target);
}

export function getMiddlewareMetadata(
  target: any,
  propertyKey: string,
): any[] | undefined {
  return Reflect.getMetadata(MIDDLEWARE_METADATA, target, propertyKey);
}

// ===== DECORATORS =====

/**
 * Controller decorator - marks a class as a controller and defines base path
 * @example
 * @Controller({
 *   basePath: "/users",
 *   tags: ["Users"],
 *   description: "User management endpoints"
 * })
 * export class UserController extends BaseController<...> {}
 */
export function Controller(options: ControllerDecoratorOptions) {
  return <T>(constructor: new (...args: any[]) => T) => {
    const existingMetadata =
      Reflect.getMetadata(CONTROLLER_METADATA, constructor) || {};
    Reflect.defineMetadata(
      CONTROLLER_METADATA,
      { ...existingMetadata, ...options },
      constructor,
    );
    CONTROLLER_CLASSES.set(constructor.name, constructor);
    return constructor;
  };
}

/**
 * Route decorator - defines HTTP route metadata
 * @example
 * @Route({ method: "get", path: "/:id", summary: "Get user by ID" })
 * async getById(c: Context) {}
 */
export function Route(options: RouteOptions) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const routes =
      Reflect.getMetadata(ROUTE_METADATA, target.constructor) || [];
    routes.push({ ...options, handler: propertyKey });
    Reflect.defineMetadata(ROUTE_METADATA, routes, target.constructor);
    return descriptor;
  };
}

/**
 * GET route decorator
 * @example
 * @Get({ path: "/:id", summary: "Get user by ID" })
 * async getById(c: Context) {}
 */
export function Get(options: Omit<RouteOptions, "method"> = {}) {
  return Route({ ...options, method: "get" });
}

/**
 * POST route decorator
 * @example
 * @Post({ path: "/", summary: "Create user", body: CreateUserDTO })
 * async create(c: Context) {}
 */
export function Post(options: Omit<RouteOptions, "method"> = {}) {
  return Route({ ...options, method: "post" });
}

/**
 * PUT route decorator
 */
export function Put(options: Omit<RouteOptions, "method"> = {}) {
  return Route({ ...options, method: "put" });
}

/**
 * PATCH route decorator
 */
export function Patch(options: Omit<RouteOptions, "method"> = {}) {
  return Route({ ...options, method: "patch" });
}

/**
 * DELETE route decorator
 */
export function Delete(options: Omit<RouteOptions, "method"> = {}) {
  return Route({ ...options, method: "delete" });
}

// ===== MIDDLEWARE DECORATOR =====

/**
 * UseMiddleware decorator - applies middleware to a route
 * @example
 * @UseMiddleware([authMiddleware, adminMiddleware])
 * @Get({ path: "/admin" })
 * async adminRoute(c: Context) {}
 */
export function UseMiddleware(middleware: MiddlewareHandler[]) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const middlewares =
      Reflect.getMetadata(MIDDLEWARE_METADATA, target, propertyKey) || [];
    Reflect.defineMetadata(
      MIDDLEWARE_METADATA,
      [...middleware, ...middlewares],
      target,
      propertyKey,
    );
    return descriptor;
  };
}
