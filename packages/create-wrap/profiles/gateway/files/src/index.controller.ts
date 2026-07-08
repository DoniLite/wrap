import { Controller, Get, RouterController } from "@donilite/wrap";
import type { Context } from "hono";
import { webFactory } from "@/factory/web.factory";
import { ProxyController } from "@/features/proxy/web/proxy.controller";

/**
 * Root controller: owns health/root routes and composes feature
 * controllers as children — the only controller registered on `Wrap`
 * itself (see src/index.ts). Each child keeps its own
 * `@Controller({ basePath })` as the single source of truth for where it
 * lives; add new features here as `this.register(SomeController)`.
 *
 * The WebSocket proxy (src/gateway/ws-proxy.ts) is mounted directly on
 * `Wrap` in src/index.ts instead of through a controller — it needs the
 * raw Bun.serve `websocket` handler wiring, same as `@donilite/wrap/realtime`.
 */
@Controller({
  basePath: "/",
  tags: ["Health"],
  description: "Service health and root routes",
})
export class IndexController extends RouterController {
  constructor() {
    super(webFactory.createApp());
    this.register(ProxyController);
  }

  @Get({ path: "/", description: "Health check" })
  async health(c: Context) {
    return c.json({ status: "ok" });
  }
}
