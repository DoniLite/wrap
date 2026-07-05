import "reflect-metadata";
import "./bootstrap"; // env + database — must stay first
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { requestId } from "hono/request-id";
import { bodyLimit } from "hono/body-limit";
import {
  errorHandler,
  requestLoggerMiddleware,
  ResponseHelper,
  setupSwagger,
} from "@donilite/wrap";
import { createRealtime } from "@donilite/wrap/realtime";
import api from "@/index.controller";
import { auth } from "@/middleware/auth";
import { appConfig } from "@/config/app.config";

const app = new Hono();

// Global middlewares
app.use(requestId());
app.use(secureHeaders());
app.use(
  cors({
    origin: appConfig.cors.origin, // Allow configured origins
    credentials: appConfig.cors.credentials, // Allow cookies
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  }),
);
app.use(bodyLimit({ maxSize: 1024 * 1024 })); // 1 MB
app.use(requestLoggerMiddleware());

// Unified error contract (same mapping as BaseController.handleError)
app.onError(errorHandler());

app.notFound((c) => {
  return c.json(
    ResponseHelper.error(`The path ${c.req.path} does not exist`),
    404,
  );
});

// Setup Swagger
if (appConfig.swagger.enabled) {
  setupSwagger(
    app,
    {
      title: appConfig.swagger.title,
      version: appConfig.swagger.version,
      description: 'API documentation with enhanced features',
      servers: [
        {
          url: `http://${appConfig.host === '0.0.0.0' ? 'localhost' : appConfig.host}:${appConfig.port}`,
          description: (process.env.NODE_ENV || 'development').toUpperCase(),
        },
      ],
    },
    appConfig.swagger.path,
  );
}

app.use("/admin/*", auth.authMiddleware);

app.route("/api", api);

// Realtime: native Bun WebSocket topics + optional Redis relay for
// multi-instance fan-out. Entity writes are auto-published on
// `entity:<table>` channels.
const realtime = createRealtime({ redisUrl: process.env.REDIS_URL });
app.get("/realtime", realtime.upgrade);
realtime.bindEntityEvents();

const server = Bun.serve({
  port: appConfig.port,
  hostname: appConfig.host,
  fetch: app.fetch,
  websocket: realtime.websocket,
});
realtime.attach(server);

console.log(`⚡ ready on http://localhost:${server.port}`);
