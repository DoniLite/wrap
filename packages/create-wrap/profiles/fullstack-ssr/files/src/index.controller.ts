import { Controller, Get, RouterController } from "@donilite/wrap";
import type { Context } from "hono";
import { webFactory } from "@/factory/web.factory";

/**
 * API router — mounted at `/api`, NOT `/`, so it doesn't collide with the
 * SSR catch-all (`app.get("*", ...)` in `src/index.ts`) that renders
 * TanStack Router pages at "/" and below. Add JSON API routes here or as
 * children the same way the other profiles do; add pages in
 * `src/ssr/routes.tsx` instead.
 */
@Controller({
  basePath: "/api",
  tags: ["Health"],
  description: "Service health and JSON API routes",
})
export class IndexController extends RouterController {
  constructor() {
    super(webFactory.createApp());
  }

  @Get({ path: "/health", description: "Health check" })
  async health(c: Context) {
    return c.json({ status: "ok" });
  }
}
