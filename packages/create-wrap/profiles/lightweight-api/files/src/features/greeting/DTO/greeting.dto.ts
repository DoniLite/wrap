import { z } from "zod";
import { DTO, SchemaDTO } from "@donilite/wrap";

/**
 * This profile has no entity/repository — `SchemaDTO()` builds a DTO
 * straight from a zod schema (validation + OpenAPI, same as an
 * entity-derived one) for features that aren't table-backed.
 */
@DTO()
export class GreetingRequestDTO extends SchemaDTO(
  z.object({
    name: z.string().min(1).max(80),
  }),
) {}

@DTO()
export class GreetingResponseDTO extends SchemaDTO(
  z.object({
    message: z.string(),
  }),
) {}
