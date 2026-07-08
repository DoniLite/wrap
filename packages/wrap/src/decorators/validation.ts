/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { bodyGetter, ContextInstance } from "../types/base";
import { DTO_CLASSES } from "./registries";
import { AppVariables } from "../registry";

// ===== ERROR CLASSES =====
export class ValidationError extends Error {
  constructor(
    public statusCode: ContentfulStatusCode,
    public errors: Array<{ property: string; constraints: any; value: any }>,
  ) {
    super("Validation failed");
    this.name = "ValidationError";
  }
}

// ===== VALIDATION DECORATOR =====

/**
 * ValidateDTO decorator - validates request body against the DTO's zod schema
 * @example
 * @ValidateDTO(CreateUserDTO, "json")
 * async create(dto: CreateUserDTO, context: Context) {}
 */
export function ValidateDTO<T extends object, B extends bodyGetter>(
  dtoClassName?: new (...args: any[]) => T,
  provider: B = "json" as B,
) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // Real Hono requests: detected by class. `Object.keys(c.req)` doesn't
      // include method names like "json" (they live on HonoRequest's
      // prototype, not as own properties), so `instanceof Context` is the
      // stable check — but it doesn't match the plain-object test double
      // from `@donilite/wrap/testing`'s `testContext()`, so that shape is
      // still accepted via the duck-typed fallback below.
      const c: Context<{ Variables: AppVariables }> | undefined = args.find(
        (arg) =>
          arg instanceof Context ||
          (arg &&
            typeof arg === "object" &&
            "req" in arg &&
            arg.req &&
            typeof arg.req === "object" &&
            Object.keys(arg.req).includes(provider)),
      );

      if (!c) {
        throw new Error(
          `The method ${propertyKey} decorated with @ValidateDTO must receive the Hono context (c) as an argument.`,
        );
      }

      const rawBody = (await c.req[provider]()) as ContextInstance<B>;
      let body: Record<string, unknown> = {};

      let dtoClass: any;
      if (provider === "json") {
        body = rawBody as Record<string, unknown>;
      } else if (provider === "formData") {
        body = Object.fromEntries((rawBody as FormData).entries());
      } else if (provider === "query") {
        body = rawBody as Record<string, unknown>;
      }

      const paramTypes: Array<new (...args: any[]) => unknown> | undefined =
        Reflect.getMetadata("design:paramtypes", target, propertyKey);

      // The argument that already is an instance of a registered DTO class
      // (e.g. `service.create(CreateUserDTO.from(body), c)`). Needed for
      // generic base-class methods, whose emitted param types erase to Object.
      const dtoArg = args.find(
        (arg) =>
          arg &&
          typeof arg === "object" &&
          arg.constructor &&
          DTO_CLASSES.has(arg.constructor.name),
      );

      if (dtoClassName) {
        dtoClass = DTO_CLASSES.get(dtoClassName.name);
        if (!dtoClass) {
          throw new Error(`DTO class "${dtoClassName}" not found in registry`);
        }
      } else {
        dtoClass =
          paramTypes?.find((param: any) => DTO_CLASSES.has(param.name)) ??
          dtoArg?.constructor;

        if (!dtoClass) {
          throw new Error(
            `No DTO class found for ${target.constructor.name}.${propertyKey}. ` +
              `Pass the DTO class to @ValidateDTO(...) or provide a DTO instance as argument.`,
          );
        }
      }

      const result = dtoClass.schema.safeParse(body);

      if (!result.success) {
        throw new ValidationError(
          400,
          result.error.issues.map((issue: any) => ({
            property: issue.path.join("."),
            constraints: { [issue.code]: issue.message },
            value: issue.input,
          })),
        );
      }

      const dtoInstance = Object.assign(new dtoClass(), result.data);

      // Replace the DTO argument with the validated instance. Resolve its
      // position from the emitted param types, falling back to the position
      // of the DTO instance that was actually passed.
      const paramTypeIndex = paramTypes?.findIndex(
        (param: any) => param === dtoClass || DTO_CLASSES.has(param.name),
      );
      const dtoParamIndex =
        paramTypeIndex !== undefined && paramTypeIndex !== -1
          ? paramTypeIndex
          : dtoArg !== undefined
            ? args.indexOf(dtoArg)
            : 0;

      args[dtoParamIndex] = dtoInstance;

      return originalMethod.apply(this, args);
    };
  };
}
