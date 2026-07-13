import { describe, it, expect } from "bun:test";
import { requestJson } from "@donilite/wrap/testing";
import { Controller, Get, JwtCookieAuthController, RouterController, Wrap } from "@donilite/wrap";
import type { Context } from "hono";
import { webFactory } from "@/factory/web.factory";
import { IndexController } from "@/index.controller";
import { AggregatorService } from "@/features/aggregator/services/aggregator.service";

// Exercises the actual production wiring (Wrap -> IndexController ->
// AggregatorController as a child), not a direct `new AggregatorController()`
// bypass — this is what src/index.ts really boots. No database anywhere:
// this profile aggregates an upstream API rather than owning its own data.
describe("Wrap composition root (api-aggregator profile, no DB)", () => {
  it("serves the health route registered on IndexController", async () => {
    const app = new Wrap();
    app.register(IndexController);

    const res = await requestJson(app.raw, "GET", "/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("serves AggregatorController's default (unvalidated, config-driven) route as a child registered by IndexController", async () => {
    const app = new Wrap();
    app.register(IndexController);

    const res = await requestJson(app.raw, "GET", "/aggregator/status");
    expect(res.status).toBe(200);
    expect(res.body.upstream).toBeDefined();
    expect(typeof res.body.ok).toBe("boolean");
  });

  it("serves the validated POST route, @ValidateDTO() on AggregatorService.checkUpstream() runs even without a repository", async () => {
    const app = new Wrap();
    app.register(IndexController);

    const res = await requestJson(app.raw, "POST", "/aggregator/status", {
      url: "https://example.com",
    });
    expect(res.status).toBe(200);
    expect(res.body.upstream).toBe("https://example.com");
  });

  it("rejects an invalid URL on the validated POST route", async () => {
    const app = new Wrap();
    app.register(IndexController);

    const res = await requestJson(app.raw, "POST", "/aggregator/status", {
      url: "not-a-url",
    });
    expect(res.status).toBe(400);
  });

  it("returns the standard 404 shape for unknown routes", async () => {
    const app = new Wrap();
    app.register(IndexController);

    const res = await requestJson(app.raw, "GET", "/nope");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe("AggregatorService", () => {
  it("reports ok:true when the upstream responds successfully (fetch stubbed, no network)", async () => {
    const stubbedFetch = (async () =>
      new Response(null, { status: 200 })) as unknown as typeof fetch;
    const service = new AggregatorService(stubbedFetch);

    const result = await service.probe("https://example.com");
    expect(result.ok).toBe(true);
    expect(result.upstream).toBe("https://example.com");
  });

  it("reports ok:false when the upstream call throws", async () => {
    const failingFetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const service = new AggregatorService(failingFetch);

    const result = await service.probe("https://example.com");
    expect(result.ok).toBe(false);
  });
});

@Controller({ basePath: "/occupants-like-child" })
class OrderTestChildController extends RouterController {
  constructor() {
    super(webFactory.createApp());
  }

  @Get({ path: "/" })
  async list(c: Context) {
    return c.json({ matched: "child" });
  }
}

@Controller({ basePath: "/parent-with-id" })
class OrderTestParentController extends RouterController {
  constructor() {
    super(webFactory.createApp());
    // Mirrors a real bug: a parent whose own route has a :param segment,
    // composing a child at a static prefix. Hono's router is purely
    // registration-order-dependent for overlapping patterns — if the
    // parent's own :id route were registered before the child is mounted,
    // it would swallow every request meant for the child (":id" matches
    // the literal string "occupants-like-child" too).
    this.register(OrderTestChildController);
  }

  @Get({ path: "/:id" })
  async byId(c: Context) {
    return c.json({ matched: "parent", id: c.req.param("id") });
  }
}

describe("parent → children registration order", () => {
  it("a child's static-prefix route is not swallowed by the parent's own :param route", async () => {
    const app = new Wrap();
    app.register(OrderTestParentController);

    const childRes = await requestJson(
      app.raw,
      "GET",
      "/parent-with-id/occupants-like-child",
    );
    expect(childRes.status).toBe(200);
    expect(childRes.body).toEqual({ matched: "child" });
  });

  it("the parent's own :param route still matches a genuine id", async () => {
    const app = new Wrap();
    app.register(OrderTestParentController);

    const parentRes = await requestJson(
      app.raw,
      "GET",
      "/parent-with-id/some-real-id",
    );
    expect(parentRes.status).toBe(200);
    expect(parentRes.body).toEqual({ matched: "parent", id: "some-real-id" });
  });
});

describe("JwtCookieAuthController", () => {
  it("exposes an OpenAPI security scheme", () => {
    const auth = new JwtCookieAuthController({ secret: "wrap-test" });
    const schemes = auth.openApiSecurityScheme();
    expect(Object.keys(schemes)).toEqual(["bearerAuth", "cookieAuth"]);
  });
});
