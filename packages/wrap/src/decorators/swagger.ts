/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import { SWAGGER_METADATA, CONTROLLER_METADATA } from "./constants";

export function getSwaggerMetadata(
  target: any,
  propertyKey: string,
): Record<number, any> | undefined {
  return Reflect.getMetadata(SWAGGER_METADATA, target, propertyKey);
}

// ===== SWAGGER DECORATORS =====

/**
 * ApiResponse decorator - defines response schema for Swagger
 * @example
 * @ApiResponse(200, { description: "Success", schema: UserDTO })
 * @Get({ path: "/:id" })
 * async getById(c: Context) {}
 */
export function ApiResponse(
  status: number,
  options: { description: string; schema?: any },
) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const responses =
      Reflect.getMetadata(SWAGGER_METADATA, target, propertyKey) || {};
    responses[status] = options;
    Reflect.defineMetadata(SWAGGER_METADATA, responses, target, propertyKey);
    return descriptor;
  };
}

/**
 * ApiTags decorator - adds tags to route for Swagger grouping
 * @example
 * @ApiTags(["Users", "Authentication"])
 * export class UserController {}
 */
export function ApiTags(tags: string[]) {
  return (target: any) => {
    const metadata = Reflect.getMetadata(CONTROLLER_METADATA, target) || {};
    metadata.tags = tags;
    Reflect.defineMetadata(CONTROLLER_METADATA, metadata, target);
  };
}
