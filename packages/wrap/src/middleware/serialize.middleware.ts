/* eslint-disable @typescript-eslint/no-explicit-any */
import type { z } from "zod";
import { toSerializationSchema } from "../dto";
import { logger } from "../logger";

/** Minimal structural view of a DTO class — only what serialization needs. */
export interface SerializableDTO {
  name: string;
  schema: z.ZodObject<any>;
}

export interface SerializeConfig {
  /** The DTO class to serialize to */
  dto: SerializableDTO;
  /** Whether the data is an array */
  isArray?: boolean;
}

/**
 * Serialize data through the DTO's zod schema.
 * Unknown keys are stripped (whitelist behavior) and Date fields are
 * emitted as ISO strings. Handles objects, arrays, and paginated wrappers.
 *
 * @param data - The data to serialize (plain object or array)
 * @param config - Serialization configuration
 * @returns Serialized plain object with unknown fields removed
 */
export function serialize<T>(
  data: any,
  config: SerializeConfig,
): T | T[] | null {
  if (data === null || data === undefined) {
    return null;
  }

  const { dto, isArray } = config;
  const schema = toSerializationSchema(dto.schema);

  // Handle arrays
  if (Array.isArray(data) || isArray) {
    const items = Array.isArray(data) ? data : [data];
    return items.map((item) => serializeSingle(item, schema, dto.name)) as T[];
  }

  // Handle paginated responses (has 'items' array) when the DTO itself
  // is not already a Paginated wrapper
  const isPaginatedWrapper = dto.name?.startsWith("Paginated");

  if (
    !isPaginatedWrapper &&
    data &&
    typeof data === "object" &&
    "items" in data &&
    Array.isArray(data.items)
  ) {
    return {
      ...data,
      items: data.items.map((item: any) =>
        serializeSingle(item, schema, dto.name),
      ),
    } as T;
  }

  // Handle single object
  return serializeSingle(data, schema, dto.name) as T;
}

/**
 * Serialize a single object; on schema mismatch, log and return the raw
 * data rather than failing the response.
 */
function serializeSingle<T>(
  data: any,
  schema: ReturnType<typeof toSerializationSchema>,
  dtoName: string,
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    logger.warn(`Serialization mismatch for ${dtoName}, returning raw data`, {
      issues: JSON.stringify(result.error.issues.slice(0, 3)),
    });
    return data as T;
  }
  return result.data as T;
}

/**
 * Create a serialization wrapper for response data
 * Useful for manual serialization in controllers
 *
 * @example
 * const serializer = createSerializer(UserResponseDTO);
 * return c.json(serializer(userData));
 */
export function createSerializer<T>(
  dto: SerializableDTO,
  options?: Omit<SerializeConfig, "dto">,
) {
  return (data: any): T | T[] | null => {
    return serialize(data, { dto, ...options });
  };
}
