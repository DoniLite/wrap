import { describe, it, expect } from "bun:test";
import { SwaggerGenerator, Wrap } from "@donilite/wrap";
// Side-effect import: registers @Controller/@Route metadata used below.
import "@/index.controller";
import { IndexController } from "@/index.controller";

// AggregatorController's field initializer resolves AggregatorService
// through `ServiceFactory.getService()`, a process-wide singleton cache —
// the FIRST construction anywhere in the test run wins and is reused by
// every subsequent `it()` across every test file, including
// tests/wrap.test.ts's. Since this file is the one that constructs
// IndexController (and therefore AggregatorController) at module-eval
// time (see the `new Wrap().register(IndexController)` below, which runs
// during bun:test's collection phase, before any `it()` anywhere
// executes), stubbing `fetch` here — before that line — is what keeps
// the ENTIRE suite from ever making a real network call through the
// cached singleton, regardless of which test file happens to touch the
// aggregator routes first.
globalThis.fetch = (async () =>
  new Response(null, { status: 200 })) as unknown as typeof fetch;

// Registering on a Wrap is what makes resolveControllerPath() have
// anything recorded to walk (see @donilite/wrap's swagger generator).
new Wrap().register(IndexController);

describe("SwaggerGenerator (api-aggregator profile, no DB)", () => {
  it("documents the aggregator routes without needing a database", () => {
    const generator = new SwaggerGenerator({ title: "Test", version: "0.0.0" });
    const spec = generator.generateSpec();

    expect(spec.paths["/aggregator/status"]?.get).toBeDefined();
    expect(
      spec.tags.some((t: { name: string }) => t.name === "Aggregator"),
    ).toBe(true);
  });
});
