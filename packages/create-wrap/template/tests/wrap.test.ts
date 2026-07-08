import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import {
  createTestDatabase,
  requestJson,
  type TestDatabase,
} from "@donilite/wrap/testing";
import { JwtCookieAuthController, Wrap } from "@donilite/wrap";
import * as schemas from "@/db";
import { IndexController } from "@/index.controller";

let testDb: TestDatabase;
let app: Wrap;

beforeAll(async () => {
  testDb = await createTestDatabase({ schema: schemas });
  app = new Wrap();
  app.register(IndexController);
});

afterAll(async () => {
  await testDb.destroy();
});

beforeEach(async () => {
  await testDb.truncateAll();
});

// Exercises the actual production wiring (Wrap -> IndexController ->
// ExampleController as a child), not a direct `new ExampleController()`
// bypass — this is what src/index.ts really boots.
describe("Wrap composition root", () => {
  it("serves the health route registered on IndexController", async () => {
    const res = await requestJson(app.raw, "GET", "/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("serves ExampleController as a child registered by IndexController", async () => {
    const created = await requestJson(app.raw, "POST", "/api/examples", {
      name: "Through Wrap",
    });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe("Through Wrap");

    const fetched = await requestJson(
      app.raw,
      "GET",
      `/api/examples/${created.body.id}`,
    );
    expect(fetched.status).toBe(200);
  });

  it("returns the standard 404 shape for unknown routes", async () => {
    const res = await requestJson(app.raw, "GET", "/nope");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("applies a middleware registered via .with()", async () => {
    const marked = new Wrap();
    marked.with(async (c, next) => {
      c.header("X-Test", "yes");
      await next();
    });
    marked.register(IndexController);

    const res = await requestJson(marked.raw, "GET", "/");
    expect(res.response.headers.get("x-test")).toBe("yes");
  });

  it("guards a registered controller's whole mount via register()'s middlewares option", async () => {
    const auth = new JwtCookieAuthController({ secret: "wrap-test" });
    const guarded = new Wrap();
    // IndexController is mounted at "/" — middlewares here must guard even
    // its bare mount path, not just deeper sub-paths.
    guarded.register(IndexController, { middlewares: [auth.authMiddleware] });

    const anonymous = await requestJson(guarded.raw, "GET", "/");
    expect(anonymous.status).toBe(401);

    const child = await requestJson(guarded.raw, "GET", "/api/examples");
    expect(child.status).toBe(401);
  });
});
