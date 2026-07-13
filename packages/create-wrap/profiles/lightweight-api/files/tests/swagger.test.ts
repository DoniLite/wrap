import { describe, it, expect } from "bun:test";
import { JwtCookieAuthController, SwaggerGenerator, Wrap } from "@donilite/wrap";
// Side-effect import: registers @Controller/@Route metadata used below.
import "@/index.controller";
import { IndexController } from "@/index.controller";

// Registering on a Wrap is what makes resolveControllerPath() have
// anything recorded to walk (see @donilite/wrap's swagger generator).
new Wrap().register(IndexController);

describe("SwaggerGenerator (lightweight-api profile, no DB)", () => {
  it("documents the greeting routes without needing a database", () => {
    const generator = new SwaggerGenerator({ title: "Test", version: "0.0.0" });
    const spec = generator.generateSpec();

    expect(spec.paths["/greeting"]?.post).toBeDefined();
  });

  it("marks the private greeting route as requiring auth", () => {
    const auth = new JwtCookieAuthController({ secret: "swagger-test" });
    const generator = new SwaggerGenerator({ title: "Test", version: "0.0.0" }, auth);
    const spec = generator.generateSpec();

    const guarded = spec.paths["/greeting/private"]?.post;
    expect(guarded.security).toBeDefined();
    expect(guarded.security.length).toBeGreaterThan(0);
    expect(guarded.responses["401"]).toBeDefined();

    const publicRoute = spec.paths["/greeting"]?.post;
    expect(publicRoute.security).toBeUndefined();
  });
});
