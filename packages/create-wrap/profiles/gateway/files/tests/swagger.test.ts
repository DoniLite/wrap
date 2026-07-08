import { describe, it, expect } from "bun:test";
import { SwaggerGenerator, Wrap } from "@donilite/wrap";
// Side-effect import: registers @Controller/@Route metadata used below.
import "@/index.controller";
import { IndexController } from "@/index.controller";

// Registering on a Wrap is what makes resolveControllerPath() have
// anything recorded to walk (see @donilite/wrap's swagger generator).
new Wrap().register(IndexController);

describe("SwaggerGenerator (gateway profile, no DB)", () => {
  it("documents the proxy route without needing a database", () => {
    const generator = new SwaggerGenerator({ title: "Test", version: "0.0.0" });
    const spec = generator.generateSpec();

    expect(spec.paths["/proxy/*"]?.get).toBeDefined();
    expect(spec.tags.some((t: { name: string }) => t.name === "Gateway")).toBe(true);
  });
});
