import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { renderPage } from "@/ssr/render";

// Exercises the actual SSR round trip: an HTTP request -> Hono catch-all ->
// TanStack Router route matching -> React server render -> HTML. Doesn't
// cover client hydration — there isn't any yet (see src/ssr/render.tsx's
// header comment and the project README).
function buildApp() {
  const app = new Hono();
  app.get("*", async (c) => {
    const html = await renderPage(c);
    return c.html(html);
  });
  return app;
}

describe("SSR render (fullstack-ssr profile)", () => {
  it("renders the home route at /", async () => {
    const res = await buildApp().request("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toMatch(/Rendered server-side by Hono/);
  });

  it("renders the about route at /about", async () => {
    const res = await buildApp().request("/about");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/About/);
  });
});
