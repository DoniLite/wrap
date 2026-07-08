import "reflect-metadata";
import "./bootstrap"; // env + database — must stay first
import { Wrap } from "@donilite/wrap";
import { createRealtime } from "@donilite/wrap/realtime";
import { IndexController } from "@/index.controller";
import { auth } from "@/middleware/auth";
import { appConfig } from "@/config/app.config";

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
app.use("/admin/*", auth.authMiddleware);

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

// Realtime: native Bun WebSocket topics + optional Redis relay for
// multi-instance fan-out. Entity writes are auto-published on
// `entity:<table>` channels. Uses the `.raw` escape hatch — realtime needs
// the underlying Hono instance and the raw Bun.serve server handle.
const realtime = createRealtime({ redisUrl: process.env.REDIS_URL });
app.get("/realtime", realtime.upgrade);

const server = app.listen(appConfig.port, appConfig.host, {
  websocket: realtime.websocket,
});
realtime.attach(server);
realtime.bindEntityEvents();

console.log(`⚡ ready on http://localhost:${server.port}`);
