import { Service, ValidateDTO, WrapService } from "@donilite/wrap";
import type { Context } from "hono";
import type { GreetingRequestDTO, GreetingResponseDTO } from "../DTO/greeting.dto";

/**
 * `WrapService` (not `BaseService<Repo>`) — no repository/entity attached.
 * This is the base for orchestration, aggregation or any feature that
 * isn't table-CRUD: reach out to another service, call an external API,
 * compose other services, etc. See `RouterController`/`BaseController` in
 * `web/greeting.controller.ts` for the matching controller-side pattern.
 *
 * Same conventions as an entity-backed `BaseService`, even without a
 * repository: `@Service()` on the class (registers it with
 * `ServiceFactory`/`SERVICE_CLASSES`, same singleton lookup
 * `BaseController`-style controllers use), and `@ValidateDTO()` on any
 * method that takes user-supplied input — it validates the request body
 * against the DTO's zod schema and replaces the argument with the parsed
 * instance, exactly like `BaseService.create()` already does for
 * entity-backed services. Both decorators are fully generic in
 * `@donilite/wrap` (no dependency on `BaseService`/a repository) — this
 * isn't a special DB-free variant, it's the same paradigm.
 */
@Service()
export class GreetingService extends WrapService {
  @ValidateDTO()
  async greet(
    dto: GreetingRequestDTO,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _c: Context,
  ): Promise<GreetingResponseDTO> {
    this.logger.debug("Building greeting", { name: dto.name });
    return { message: `Hello, ${dto.name}!` } as GreetingResponseDTO;
  }
}
