import {
  ApiResponse,
  Controller,
  Post,
  RouterController,
  ServiceFactory,
  Serialize,
  UseMiddleware,
} from "@donilite/wrap";
import type { Context } from "hono";
import { webFactory } from "@/factory/web.factory";
import { auth } from "@/middleware/auth";
import { GreetingRequestDTO, GreetingResponseDTO } from "../DTO/greeting.dto";
import { GreetingService } from "../services/greeting.service";

/**
 * `RouterController` (not `BaseController<Service>`) — no repository, no
 * entity, just a plain Hono-mounted controller backed by a service.
 * Demonstrates the auth-only / lightweight-API shape: routes, DTOs,
 * OpenAPI docs and auth guards all work without a database — and the
 * controller-side half of the `@Service()`/`@ValidateDTO()` convention
 * (`ServiceFactory.getService()`, body -> `DTO.from()` -> service call)
 * is identical to an entity-backed `BaseController`, see
 * `src/features/example/web/example.controller.ts` in the full-backend
 * profile for the same shape with a repository behind it.
 */
@Controller({
  basePath: "/greeting",
  tags: ["Greeting"],
  description: "Example auth-guarded, DB-free feature",
})
export class GreetingController extends RouterController {
  private readonly service = ServiceFactory.getService(GreetingService);

  constructor() {
    super(webFactory.createApp());
  }

  @Post({
    path: "/",
    description: "Greet a name — public route",
    body: GreetingRequestDTO,
  })
  @ApiResponse(200, { description: "Success", schema: GreetingResponseDTO })
  @Serialize(GreetingResponseDTO)
  async greet(c: Context) {
    try {
      const body = await c.req.json();
      const dto = GreetingRequestDTO.from(body);
      const result = await this.service.greet(dto, c);
      return c.json(result);
    } catch (e) {
      return this.handleError(c, e);
    }
  }

  @Post({
    path: "/private",
    description: "Greet a name — requires authentication",
    body: GreetingRequestDTO,
  })
  @ApiResponse(200, { description: "Success", schema: GreetingResponseDTO })
  @UseMiddleware([auth.authMiddleware])
  @Serialize(GreetingResponseDTO)
  async greetPrivate(c: Context) {
    try {
      const body = await c.req.json();
      const dto = GreetingRequestDTO.from(body);
      const result = await this.service.greet(dto, c);
      return c.json(result);
    } catch (e) {
      return this.handleError(c, e);
    }
  }
}
