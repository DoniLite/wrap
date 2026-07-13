import { Service, ValidateDTO, WrapService } from "@donilite/wrap";
import type { Context } from "hono";
import type { CheckUpstreamRequestDTO, UpstreamStatusDTO } from "../DTO/aggregator.dto";

/**
 * `WrapService` — no repository/entity, this feature's data is an
 * upstream HTTP API rather than this app's own table. The API-aggregator
 * profile is meant for apps that mostly declare services like this one
 * (fetch + shape + validate) fronted by controllers, purely to get typed
 * routes and OpenAPI docs over calls this app doesn't own the data for.
 *
 * Same `@Service()` + `@ValidateDTO()` convention as an entity-backed
 * `BaseService`, even without a repository: `@Service()` registers the
 * class with `ServiceFactory` (singleton lookup, same as
 * `BaseController`-style controllers use); `@ValidateDTO()` on
 * `checkUpstream()` validates the caller-supplied URL against
 * `CheckUpstreamRequestDTO`'s zod schema before the method body runs —
 * both decorators are fully generic in `@donilite/wrap`, no dependency on
 * a repository. Follow the same shape for your own upstream-calling
 * services.
 *
 * `fetchImpl` is constructor-injectable so tests don't hit the network —
 * see tests/wrap.test.ts, which passes a stub.
 */
@Service()
export class AggregatorService extends WrapService {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {
    super();
  }

  /** Validated entry point — `url` comes from the request body, see `web/aggregator.controller.ts`'s `checkCustom()`. */
  @ValidateDTO()
  async checkUpstream(
    dto: CheckUpstreamRequestDTO,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _c: Context,
  ): Promise<UpstreamStatusDTO> {
    return this.probe(dto.url);
  }

  /** Unvalidated entry point for a caller-controlled URL (e.g. `appConfig.externalApi.baseUrl` — not user input, nothing to validate). */
  async probe(upstreamUrl: string): Promise<UpstreamStatusDTO> {
    this.logger.debug("Checking upstream", { upstreamUrl });
    let ok = false;
    try {
      const res = await this.fetchImpl(upstreamUrl, { method: "HEAD" });
      ok = res.ok;
    } catch (e) {
      this.logger.warn("Upstream check failed", { upstreamUrl }, e);
    }
    return {
      upstream: upstreamUrl,
      ok,
      checkedAt: new Date().toISOString(),
    } as UpstreamStatusDTO;
  }
}
