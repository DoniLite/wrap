import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routes";

/**
 * Build a fresh router per SSR request — a TanStack Router instance holds
 * per-navigation state, so sharing one across concurrent requests would
 * leak state between them. `createMemoryHistory` seeds it at the
 * requested URL instead of the browser's `window.location` (there is no
 * browser here).
 */
export function createAppRouter(url: string) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
  });
}
