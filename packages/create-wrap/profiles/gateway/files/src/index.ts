import "reflect-metadata";
import "./bootstrap"; // env — must stay first
import { Wrap } from "@donilite/wrap";
import { IndexController } from "@/index.controller";
import { auth } from "@/middleware/auth";
import { appConfig } from "@/config/app.config";
import { wsProxy, wsProxyWebSocketHandlers } from "@/gateway/ws-proxy";

const app = new Wrap({
  cors: {
    origin: appConfig.cors.origin,
    credentials: appConfig.cors.credentials,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  },
});

// Auth: made available to `.swagger()` for the generated spec's security
// schemes; guards apply per route group, same as any other middleware.
app.with(auth);

// Controllers self-register at their own @Controller basePath.
app.register(IndexController);

if (appConfig.swagger.enabled) {
  app.swagger({
    path: appConfig.swagger.path,
    title: appConfig.swagger.title,
    version: appConfig.swagger.version,
    description: "API documentation with enhanced features",
    servers: [
      {
        url: `http://${appConfig.host === "0.0.0.0" ? "localhost" : appConfig.host}:${appConfig.port}`,
        description: (process.env.NODE_ENV || "development").toUpperCase(),
      },
    ],
  });
}

// WebSocket proxy — best-effort helper, see src/gateway/ws-proxy.ts for
// what it does and doesn't cover before relying on this. Defaults to the
// same upstream as the HTTP proxy with its scheme swapped to ws(s); point
// it at a different upstream by passing your own `target`.
app.get(
  "/ws-proxy/*",
  wsProxy({ target: appConfig.upstream.baseUrl.replace(/^http/, "ws") }),
);

const server = app.listen(appConfig.port, appConfig.host, {
  websocket: wsProxyWebSocketHandlers,
});

console.log(`⚡ ready on http://localhost:${server.port}`);
