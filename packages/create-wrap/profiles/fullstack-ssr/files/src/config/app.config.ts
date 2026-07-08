import { logger } from "@donilite/wrap";

/**
 * Application configuration — Fullstack-SSR profile: no `database`,
 * `storage` or `email` sections by default (the app is scaffolded without
 * a DB; add these back, same shape as the full-backend profile, if the
 * project needs to persist data alongside its SSR pages).
 */
export interface AppConfig {
  // Server
  port: number;
  host: string;
  env: "development" | "production" | "test";

  // JWT
  jwt: {
    secret: string;
    expiresIn: string;
  };

  // Rate Limiting
  rateLimit: {
    enabled: boolean;
    max: number;
    window: number;
  };

  // Cache (in-memory — no Redis in this profile)
  cache: {
    enabled: boolean;
    ttl: number;
  };

  // Logging
  logging: {
    level: "debug" | "info" | "warn" | "error";
    format: "json" | "text";
  };

  // Swagger
  swagger: {
    enabled: boolean;
    path: string;
    title: string;
    version: string;
  };

  // Cors
  cors: {
    origin: string[];
    credentials: boolean;
  };
}

export const appConfig: AppConfig = {
  port: Number(process.env.PORT) || 5000,
  host: process.env.HOST || "0.0.0.0",
  env: (process.env.NODE_ENV as AppConfig["env"]) || "development",

  jwt: {
    secret: process.env.JWT_SECRET || "your-secret-key",
    expiresIn: process.env.JWT_EXPIRES_IN || "5h",
  },

  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== "false",
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    window: Number(process.env.RATE_LIMIT_WINDOW) || 60,
  },

  cache: {
    enabled: process.env.CACHE_ENABLED !== "false",
    ttl: Number(process.env.CACHE_TTL) || 300,
  },

  logging: {
    level: (process.env.LOG_LEVEL as AppConfig["logging"]["level"]) || "info",
    format:
      (process.env.LOG_FORMAT as AppConfig["logging"]["format"]) || "text",
  },

  swagger: {
    enabled: process.env.SWAGGER_ENABLED !== "false",
    path: process.env.SWAGGER_PATH || "/docs",
    title: process.env.SWAGGER_TITLE || "API Documentation",
    version: process.env.SWAGGER_VERSION || "1.0.0",
  },

  cors: {
    origin: (process.env.CORS_ORIGIN || "*").split(",").map((origin) => {
      logger.info(`Adding CORS origin: ${origin}`);
      return origin.trim();
    }),
    credentials: process.env.CORS_CREDENTIALS === "true",
  },
};
