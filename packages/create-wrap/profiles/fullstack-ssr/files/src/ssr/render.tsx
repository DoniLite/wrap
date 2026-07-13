import { renderToString } from "react-dom/server";
import { RouterProvider } from "@tanstack/react-router";
import type { Context } from "hono";
import { createAppRouter } from "./router";

/**
 * Mounts TanStack Router's SSR render as an ordinary Hono route — this is
 * the actual mechanism the fullstack-ssr profile is built around: `Wrap`
 * doesn't gain a new primitive for this, a catch-all `app.get("*", ...)`
 * (see `src/index.ts`) is all that's needed, same as any other route.
 *
 * IMPORTANT — what this profile ships vs. what it doesn't:
 *   - Ships: server-side route matching + rendering (this file), a real,
 *     runnable round trip from an HTTP request to server-rendered HTML.
 *   - Does NOT ship: client-side hydration. There's no client JS bundle
 *     wired up (no Vite/esbuild build step in this template), so pages are
 *     server-rendered HTML only — no `hydrateRoot()`, no interactivity
 *     beyond plain links/forms. Wiring a client bundle + hydration is a
 *     genuine, separate piece of work (a bundler config + a client entry
 *     point) intentionally left as a follow-up rather than guessed at
 *     unsupervised — see the project README for the pointer.
 */
export async function renderPage(c: Context): Promise<string> {
  const router = createAppRouter(c.req.path);
  await router.load();

  const appHtml = renderToString(<RouterProvider router={router} />);
  // The root route's own `component` already renders <html>/<head>/<body>
  // (see src/ssr/routes.tsx), so `appHtml` is the full document string.
  return `<!DOCTYPE html>${appHtml}`;
}
