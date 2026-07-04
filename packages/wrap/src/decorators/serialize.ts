/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import { SERIALIZE_METADATA } from "./constants";
import type { z } from "zod";

/** Minimal structural view of a DTO class (avoids importing core/dto). */
type SerializableDTOClass = {
  new (...args: any[]): any;
  name: string;
  schema: z.ZodObject<any>;
};

export interface SerializeOptions {
  /** The DTO class to serialize the response to */
  dto: SerializableDTOClass;
  /** Whether to serialize arrays (default: auto-detect) */
  isArray?: boolean;
}

/**
 * Get serialize metadata from a method
 */
export function getSerializeMetadata(
  target: any,
  propertyKey: string,
): SerializeOptions | undefined {
  return Reflect.getMetadata(SERIALIZE_METADATA, target, propertyKey);
}

/**
 * Serialize decorator - transforms the response using the specified DTO class.
 * The response is parsed through the DTO's zod schema: unknown fields are
 * stripped (whitelist) and dates are emitted as ISO strings.
 *
 * @example
 * // Basic usage - only fields present in UserResponseDTO.schema are kept
 * @Serialize(UserResponseDTO)
 * @Get({ path: "/:id" })
 * async getById(c: Context) {
 *   return c.json(await this.service.findById(id));
 * }
 *
 * @example
 * // With arrays
 * @Serialize(UserResponseDTO, { isArray: true })
 * @Get({ path: "/" })
 * async list(c: Context) {
 *   return c.json(await this.service.findAll());
 * }
 */
export function Serialize(
  dto: SerializableDTOClass,
  options?: Omit<SerializeOptions, "dto">,
) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const serializeOptions: SerializeOptions = {
      dto,
      ...options,
    };

    Reflect.defineMetadata(
      SERIALIZE_METADATA,
      serializeOptions,
      target,
      propertyKey,
    );

    return descriptor;
  };
}
