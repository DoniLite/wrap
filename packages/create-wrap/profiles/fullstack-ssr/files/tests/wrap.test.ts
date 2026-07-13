import { describe, it, expect } from "bun:test";
import { requestJson } from "@donilite/wrap/testing";
import { Controller, Get, RouterController, Wrap } from "@donilite/wrap";
import type { Context } from "hono";
import { webFactory } from "@/factory/web.factory";
import { IndexController } from "@/index.controller";

// Exercises the actual production wiring (Wrap -> IndexController), not a
// direct `new IndexController()` bypass — this is what src/index.ts really
// boots for the JSON API side. No database anywhere: this profile isn't
// scaffolded with one by default. SSR page rendering is covered separately
// in tests/ssr.test.ts (renderPage() directly, not through Wrap, since the
// catch-all route lives in src/index.ts's module scope, not IndexController).
describe("Wrap composition root (fullstack-ssr profile, API side)", () => {
  it("serves the health route registered on IndexController", async () => {
    const app = new Wrap();
    app.register(IndexController);

    const res = await requestJson(app.raw, "GET", "/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("returns the standard 404 shape for unknown API routes", async () => {
    const app = new Wrap();
    app.register(IndexController);

    const res = await requestJson(app.raw, "GET", "/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
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
