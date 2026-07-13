import {
  ApiResponse,
  Controller,
  Get,
  Post,
  RouterController,
  ServiceFactory,
  Serialize,
} from "@donilite/wrap";
import type { Context } from "hono";
import { webFactory } from "@/factory/web.factory";
import { appConfig } from "@/config/app.config";
import { CheckUpstreamRequestDTO, UpstreamStatusDTO } from "../DTO/aggregator.dto";
import { AggregatorService } from "../services/aggregator.service";

/**
 * `RouterController` — no repository, no entity. Exposes typed, documented
 * routes over data this app aggregates from an upstream API rather than
 * owning itself. Add one controller like this per upstream you front.
 *
 * `ServiceFactory.getService()` (not `new AggregatorService()`) — same
 * singleton lookup an entity-backed `BaseController` uses, since
 * `AggregatorService` is `@Service()`-decorated.
 */
@Controller({
  basePath: "/aggregator",
  tags: ["Aggregator"],
  description: "Example external-API aggregation endpoints",
})
export class AggregatorController extends RouterController {
  private readonly service = ServiceFactory.getService(AggregatorService);

  constructor() {
    super(webFactory.createApp());
  }

  @Get({
    path: "/status",
    description: "Check the configured default upstream API's reachability",
  })
  @ApiResponse(200, { description: "Success", schema: UpstreamStatusDTO })
  @Serialize(UpstreamStatusDTO)
  async status(c: Context) {
    try {
      const result = await this.service.probe(appConfig.externalApi.baseUrl);
      return c.json(result);
    } catch (e) {
      return this.handleError(c, e);
    }
  }

  @Post({
    path: "/status",
    description: "Check an arbitrary upstream URL's reachability",
    body: CheckUpstreamRequestDTO,
  })
  @ApiResponse(200, { description: "Success", schema: UpstreamStatusDTO })
  @Serialize(UpstreamStatusDTO)
  async checkCustom(c: Context) {
    try {
      const body = await c.req.json();
      const dto = CheckUpstreamRequestDTO.from(body);
      const result = await this.service.checkUpstream(dto, c);
      return c.json(result);
    } catch (e) {
      return this.handleError(c, e);
    }
  }
}
