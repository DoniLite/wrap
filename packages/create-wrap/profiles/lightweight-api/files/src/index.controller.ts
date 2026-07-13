import { Controller, Get, RouterController } from "@donilite/wrap";
import type { Context } from "hono";
import { webFactory } from "@/factory/web.factory";
import { GreetingController } from "@/features/greeting/web/greeting.controller";

/**
 * Root controller: owns health/root routes and composes feature
 * controllers as children — the only controller registered on `Wrap`
 * itself (see src/index.ts). Each child keeps its own
 * `@Controller({ basePath })` as the single source of truth for where it
 * lives; add new features here as `this.register(SomeController)`.
 */
@Controller({
  basePath: "/",
  tags: ["Health"],
  description: "Service health and root routes",
})
export class IndexController extends RouterController {
  constructor() {
    super(webFactory.createApp());
    this.register(GreetingController);
  }

  @Get({ path: "/", description: "Health check" })
  async health(c: Context) {
    return c.json({ status: "ok" });
  }
}
