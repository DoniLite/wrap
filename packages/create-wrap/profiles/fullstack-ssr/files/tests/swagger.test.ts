import { describe, it, expect } from "bun:test";
import { SwaggerGenerator, Wrap } from "@donilite/wrap";
// Side-effect import: registers @Controller/@Route metadata used below.
import "@/index.controller";
import { IndexController } from "@/index.controller";

// Registering on a Wrap is what makes resolveControllerPath() have
// anything recorded to walk (see @donilite/wrap's swagger generator).
new Wrap().register(IndexController);

describe("SwaggerGenerator (fullstack-ssr profile, API side)", () => {
  it("documents the API health route (mounted under /api, not /, so it doesn't collide with SSR pages)", () => {
    const generator = new SwaggerGenerator({ title: "Test", version: "0.0.0" });
    const spec = generator.generateSpec();

    expect(spec.paths["/api/health"]?.get).toBeDefined();
  });
});
