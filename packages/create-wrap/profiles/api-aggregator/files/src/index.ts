import "reflect-metadata";
import "./bootstrap"; // env — must stay first
import { Wrap } from "@donilite/wrap";
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

const server = app.listen(appConfig.port, appConfig.host);

console.log(`⚡ ready on http://localhost:${server.port}`);
