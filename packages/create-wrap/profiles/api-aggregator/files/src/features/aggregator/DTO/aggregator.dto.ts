import { z } from "zod";
import { DTO, SchemaDTO } from "@donilite/wrap";

/**
 * No entity/repository in this profile — `SchemaDTO()` builds a DTO
 * straight from a zod schema (validation + OpenAPI) for a feature whose
 * data comes from an upstream API instead of this app's own table.
 */
@DTO()
export class UpstreamStatusDTO extends SchemaDTO(
  z.object({
    upstream: z.string(),
    ok: z.boolean(),
    checkedAt: z.string(),
  }),
) {}

/**
 * User-supplied input for the validated `POST /aggregator/status` route —
 * see `AggregatorService.checkUpstream()`, `@ValidateDTO()`-decorated.
 */
@DTO()
export class CheckUpstreamRequestDTO extends SchemaDTO(
  z.object({
    url: z.string().url(),
  }),
) {}
