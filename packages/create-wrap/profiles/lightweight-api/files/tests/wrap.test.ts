import { describe, it, expect } from "bun:test";
import { requestJson } from "@donilite/wrap/testing";
import { Controller, Get, JwtCookieAuthController, RouterController, Wrap } from "@donilite/wrap";
import type { Context } from "hono";
import { webFactory } from "@/factory/web.factory";
import { IndexController } from "@/index.controller";

// Exercises the actual production wiring (Wrap -> IndexController ->
// GreetingController as a child), not a direct `new GreetingController()`
// bypass — this is what src/index.ts really boots. No database anywhere:
// this profile is auth-only / DB-free by design.
describe("Wrap composition root (lightweight-api profile, no DB)", () => {
  it("serves the health route registered on IndexController", async () => {
    const app = new Wrap();
    app.register(IndexController);

    const res = await requestJson(app.raw, "GET", "/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("serves GreetingController as a child registered by IndexController, DTO validated by @ValidateDTO()", async () => {
    const app = new Wrap();
    app.register(IndexController);

    const res = await requestJson(app.raw, "POST", "/greeting", { name: "World" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Hello, World!" });
  });

  it("rejects an invalid body — @ValidateDTO() on GreetingService.greet() runs even without a repository", async () => {
    const app = new Wrap();
    app.register(IndexController);

    const res = await requestJson(app.raw, "POST", "/greeting", { name: "" });
    expect(res.status).toBe(400);
  });

  it("guards the private greeting route with AuthController.authMiddleware", async () => {
    const app = new Wrap();
    app.register(IndexController);

    const anonymous = await requestJson(app.raw, "POST", "/greeting/private", { name: "World" });
    expect(anonymous.status).toBe(401);
  });

  it("returns the standard 404 shape for unknown routes", async () => {
    const app = new Wrap();
    app.register(IndexController);

    const res = await requestJson(app.raw, "GET", "/nope");
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

describe("JwtCookieAuthController", () => {
  it("exposes an OpenAPI security scheme", () => {
    const auth = new JwtCookieAuthController({ secret: "wrap-test" });
    const schemes = auth.openApiSecurityScheme();
    expect(Object.keys(schemes)).toEqual(["bearerAuth", "cookieAuth"]);
  });
});
