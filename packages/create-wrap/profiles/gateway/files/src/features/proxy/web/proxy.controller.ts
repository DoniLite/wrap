import { Controller, Get, RouterController } from "@donilite/wrap";
import type { Context } from "hono";
import { proxy } from "hono/proxy";
import { webFactory } from "@/factory/web.factory";
import { appConfig } from "@/config/app.config";

/**
 * HTTP proxy example, using Hono's built-in `proxy()` helper (the standard
 * approach — see `hono/proxy` — rather than hand-rolling one). Forwards
 * everything under `/proxy/*` to `appConfig.upstream.baseUrl`, stripping
 * the `/proxy` prefix and a couple of hop-by-hop-ish headers that
 * shouldn't be blindly forwarded.
 *
 * `RouterController`, no repository/entity — this profile is about
 * fronting/relaying other services, not owning data.
 */
@Controller({
  basePath: "/proxy",
  tags: ["Gateway"],
  description: "HTTP reverse-proxy example",
})
export class ProxyController extends RouterController {
  constructor() {
    super(webFactory.createApp());
  }

  @Get({ path: "/*", description: "Proxy GET requests to the configured upstream" })
  async proxyGet(c: Context) {
    const upstreamPath = c.req.path.replace(/^\/proxy/, "");
    return proxy(`${appConfig.upstream.baseUrl}${upstreamPath}`, {
      headers: {
        ...c.req.header(),
        "X-Forwarded-For": c.req.header("x-forwarded-for") ?? "",
        "X-Forwarded-Host": c.req.header("host"),
        // Don't propagate this app's own auth to the upstream by default —
        // opt back in per-route if the upstream expects it.
        Authorization: undefined,
      },
    });
  }
}
