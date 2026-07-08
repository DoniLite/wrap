/* eslint-disable @typescript-eslint/no-explicit-any */
// src/core/swagger/index.ts
import { SwaggerUI, type SwaggerUIOptions } from "@hono/swagger-ui";
import type { Hono } from "hono";
import { z } from "zod";
import {
  getAllControllers,
  getControllerMetadata,
  getMiddlewareMetadata,
  getRouteMetadata,
  getSwaggerMetadata,
} from "../decorators";
import { getAllDTOs } from "../decorators";
import { WRAP_AUTH_MIDDLEWARE, type AuthController } from "../middleware/auth/auth.controller";

export interface SwaggerConfig {
  title: string;
  version: string;
  description?: string;
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
}

/** Security schemes used when no `AuthController` is registered on the generator. */
const DEFAULT_SECURITY_SCHEMES: Record<string, any> = {
  bearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  },
  cookieAuth: {
    type: "apiKey",
    in: "cookie",
    name: "session",
  },
};

/** Path-param names in a Hono route path, honoring both `:name` and `:name{regex}`. */
function extractPathParamNames(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z0-9_]+)(?:\{[^}]*\})?/g)].map((m) => m[1]);
}

export class SwaggerGenerator {
  private config: SwaggerConfig;
  private schemas: Record<string, any> = {};
  private authController?: AuthController;

  /**
   * @param auth An `AuthController` instance (e.g. the same one passed to
   * `Wrap.with(auth)`, including a combined one from `AuthController.combine(...)`)
   * — its `openApiSecurityScheme()` drives the generated security schemes.
   */
  constructor(config: SwaggerConfig, auth?: AuthController) {
    this.config = config;
    this.authController = auth;
  }

  /**
   * Generate OpenAPI specification from decorated controllers
   */
  generateSpec(): any {
    // Generate schemas from DTOs
    this.generateSchemas();

    const paths: Record<string, any> = {};
    const tags = new Set<string>();
    const securitySchemes =
      this.authController?.openApiSecurityScheme() ?? DEFAULT_SECURITY_SCHEMES;

    // Iterate through all registered controllers
    const controllers = getAllControllers();

    for (const ControllerClass of controllers) {
      const controllerMetadata = getControllerMetadata(ControllerClass);
      if (!controllerMetadata) continue;

      const { basePath, tags: controllerTags } = controllerMetadata;

      // Add controller tags
      if (controllerTags) {
        controllerTags.forEach((tag) => tags.add(tag));
      }

      // Get routes for this controller
      const routes = getRouteMetadata(ControllerClass) || [];

      for (const route of routes) {
        const fullPath = this.normalizePath(basePath, route.path || "");
        const method = route.method || "get";

        if (!paths[fullPath]) {
          paths[fullPath] = {};
        }

        // Build operation object
        const operation: any = {
          summary:
            route.summary ||
            route.description ||
            `${method.toUpperCase()} ${fullPath}`,
          description: route.description,
          tags: controllerTags || [],
        };

        // Add deprecated flag
        if (route.deprecated) {
          operation.deprecated = true;
        }

        // Add parameters (path, query)
        const parameters = [];

        // Path params are derived from the route path itself (`:id`, `:id{regex}`);
        // an explicit `route.params` entry only overrides type/description.
        const explicitParams = route.params || {};
        for (const name of extractPathParamNames(route.path || "")) {
          const paramInfo = explicitParams[name];
          parameters.push({
            name,
            in: "path",
            required: true,
            schema: { type: paramInfo?.type || "string" },
            description: paramInfo?.description,
          });
        }

        if (route.query) {
          for (const [name, queryInfo] of Object.entries(route.query)) {
            parameters.push({
              name,
              in: "query",
              required: false,
              schema: { type: queryInfo.type },
              description: queryInfo.description,
            });
          }
        }

        if (parameters.length > 0) {
          operation.parameters = parameters;
        }

        // Add request body
        if (
          route.body &&
          (method === "post" || method === "put" || method === "patch")
        ) {
          // Handle multipart/form-data (file uploads)
          if (
            route.body.type === "multipart/form-data" &&
            route.body.properties
          ) {
            const properties: Record<string, any> = {};
            const requiredFields: string[] = [];

            for (const [propName, propInfo] of Object.entries(
              route.body.properties,
            )) {
              const propConfig = propInfo as any;
              if (propConfig.type === "file") {
                properties[propName] = {
                  type: "string",
                  format: "binary",
                  description: propConfig.description,
                };
              } else {
                properties[propName] = {
                  type: propConfig.type || "string",
                  description: propConfig.description,
                };
              }

              if (propConfig.required) {
                requiredFields.push(propName);
              }
            }

            operation.requestBody = {
              required: route.body.required ?? true,
              content: {
                "multipart/form-data": {
                  schema: {
                    type: "object",
                    properties,
                    ...(requiredFields.length > 0 && {
                      required: requiredFields,
                    }),
                  },
                },
              },
            };
          } else {
            // Handle standard JSON body
            const bodySchema = this.getSchemaRef(route.body);
            operation.requestBody = {
              required: true,
              content: {
                "application/json": {
                  schema: bodySchema,
                },
              },
            };
          }
        }

        // Add responses
        if (!route.handler) continue;

        const apiResponses =
          getSwaggerMetadata(ControllerClass.prototype, route.handler) || {};
        const allResponses = { ...apiResponses, ...(route.responses || {}) };

        operation.responses = {};

        // Transform into OpenAPI 3.0 response structure
        for (const [status, res] of Object.entries(allResponses)) {
          const responseInfo = res as any;
          const responseBody: any = {
            description: responseInfo.description || "Success",
          };

          if (responseInfo.schema) {
            responseBody.content = {
              "application/json": {
                schema: this.getSchemaRef(responseInfo.schema),
              },
            };
          }

          operation.responses[status] = responseBody;
        }

        // Add default responses if not specified
        if (!operation.responses["200"] && !operation.responses["201"]) {
          operation.responses["200"] = {
            description: "Success",
          };
        }

        if (!operation.responses["400"]) {
          operation.responses["400"] = {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                    errors: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          property: { type: "string" },
                          constraints: { type: "object" },
                          value: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          };
        }

        // Add security requirements for routes guarded by an AuthController
        // middleware (authMiddleware / requireRoles) — tagged at the source
        // rather than sniffed by function name (see auth.controller.ts).
        const middlewares =
          getMiddlewareMetadata(ControllerClass.prototype, route.handler) || [];
        const hasAuthMiddleware = middlewares.some(
          (mw: any) => Boolean(mw?.[WRAP_AUTH_MIDDLEWARE]),
        );

        if (hasAuthMiddleware) {
          operation.security = Object.keys(securitySchemes).map((name) => ({
            [name]: [],
          }));

          // Add 401 response if not present
          if (!operation.responses["401"]) {
            operation.responses["401"] = {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            };
          }
        }

        paths[fullPath][method] = operation;
      }
    }

    // Build OpenAPI spec
    return {
      openapi: "3.0.0",
      info: {
        title: this.config.title,
        version: this.config.version,
        description: this.config.description,
      },
      servers: this.config.servers || [
        { url: "http://localhost:3000", description: "Development server" },
      ],
      tags: Array.from(tags).map((tag) => ({ name: tag })),
      paths,
      components: {
        schemas: this.schemas,
        securitySchemes,
      },
    };
  }

  /**
   * Generate JSON schemas from the DTO registry — each DTO's zod schema
   * is converted with z.toJSONSchema.
   */
  private generateSchemas() {
    const schemas: Record<string, any> = {};
    const dtoClasses = getAllDTOs();

    for (const dtoClass of dtoClasses) {
      const cls = dtoClass as { name?: string; schema?: z.ZodObject<any> };
      if (!cls.name || !cls.schema) continue;

      try {
        schemas[cls.name] = z.toJSONSchema(cls.schema, {
          target: "openapi-3.0",
          unrepresentable: "any",
          io: "input",
          override: (ctx) => {
            const def = (ctx.zodSchema as any)?._zod?.def;
            if (def?.type === "date") {
              ctx.jsonSchema.type = "string";
              (ctx.jsonSchema as any).format = "date-time";
            }
          },
        });
      } catch (error) {
        console.warn(`Could not generate schema for ${cls.name}:`, error);
        schemas[cls.name] = { type: "object" };
      }
    }

    this.schemas = {
      ...schemas,
      Object: {
        type: "object",
        additionalProperties: true,
      },
    };
  }

  /**
   * Get schema reference for a DTO class. DTO registration uses
   * deterministic names, so resolution is an exact match.
   */
  private getSchemaRef(dtoClass: any): any {
    const name = typeof dtoClass === "string" ? dtoClass : dtoClass?.name;

    if (name && this.schemas[name]) {
      return { $ref: `#/components/schemas/${name}` };
    }

    console.warn(
      `Could not find schema for ${name || dtoClass}, returning empty object`,
    );
    return { type: "object" };
  }

  /**
   * Normalize and combine base path with route path
   */
  private normalizePath(basePath: string, routePath: string): string {
    // Ensure basePath starts with / and remove trailing slashes
    if (!basePath.startsWith("/")) basePath = "/" + basePath;
    basePath = basePath.replace(/\/$/, "");

    // Ensure routePath doesn't double slash and remove trailing slashes
    routePath = routePath.replace(/^\//, "");
    routePath = routePath.replace(/\/$/, "");

    // Combine paths
    const fullPath = routePath ? `${basePath}/${routePath}` : basePath || "/";

    // Convert Hono params (:id, :id{regex}) to OpenAPI params ({id})
    return fullPath.replace(/:([A-Za-z0-9_]+)(?:\{[^}]*\})?/g, "{$1}");
  }

  /**
   * Setup Swagger UI routes on a Hono app
   */
  setupSwaggerUI(
    app: Hono<any, any, any>,
    swaggerPath: string = "/docs",
    uiOptions?: Partial<SwaggerUIOptions>,
  ) {
    const spec = this.generateSpec();

    // Serve OpenAPI spec as JSON
    app.get(`${swaggerPath}/openapi.json`, (c) => {
      return c.json(spec);
    });

    // Serve Swagger UI
    app.get(swaggerPath, (c) => {
      return c.html(
        SwaggerUI({
          url: `${swaggerPath}/openapi.json`,
          ...uiOptions,
        }),
      );
    });

    return app;
  }
}

/**
 * Helper function to setup Swagger on an app
 */
export function setupSwagger(
  app: Hono<any, any, any>,
  config: SwaggerConfig,
  path: string = "/docs",
  options?: {
    auth?: AuthController;
    ui?: Partial<SwaggerUIOptions>;
  },
) {
  const generator = new SwaggerGenerator(config, options?.auth);
  return generator.setupSwaggerUI(app, path, options?.ui);
}
