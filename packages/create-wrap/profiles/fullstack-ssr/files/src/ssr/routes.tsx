import { createRootRoute, createRoute, Link, Outlet } from "@tanstack/react-router";

/**
 * TanStack Router route tree — the pages themselves live here, same as a
 * client-only TanStack Router app. What's different in this profile is
 * WHO renders them and WHEN: see `src/ssr/render.tsx`, which resolves this
 * tree server-side (in a Hono route handler) instead of in the browser.
 *
 * Add pages by adding routes here and wiring them into `routeTree`'s
 * children — same shape you'd use in a client-only TanStack Router app.
 */
export const rootRoute = createRootRoute({
  component: () => (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{{APP_NAME}}</title>
      </head>
      <body>
        <nav>
          <Link to="/">Home</Link> | <Link to="/about">About</Link>
        </nav>
        <main>
          <Outlet />
        </main>
      </body>
    </html>
  ),
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <div>
      <h1>{{APP_NAME}}</h1>
      <p>Rendered server-side by Hono, routed by TanStack Router.</p>
    </div>
  ),
});

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: () => (
    <div>
      <h1>About</h1>
      <p>A second page — add more routes the same way in this file.</p>
    </div>
  ),
});

export const routeTree = rootRoute.addChildren([homeRoute, aboutRoute]);
