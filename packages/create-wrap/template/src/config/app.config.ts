import { logger } from "@donilite/wrap";

/**
 * Application configuration
 */
export interface AppConfig {
  // Server
  port: number;
  host: string;
  env: "development" | "production" | "test";

  // Database
  database: {
    url: string;
    poolSize?: number;
  };

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

  // Cache
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

  // Storage
  storage: {
    provider: "local" | "s3";
    uploadDir: string;
    baseUrl: string;
    maxFileSize: number;
    allowedMimeTypes: string[];
  };

  // Email
  email: {
    enabled: boolean;
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
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

  database: {
    url: process.env.DATABASE_URL || "",
    poolSize: Number(process.env.DB_POOL_SIZE) || 10,
  },

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

  storage: {
    provider:
      (process.env.STORAGE_PROVIDER as AppConfig["storage"]["provider"]) ||
      "local",
    uploadDir: process.env.STORAGE_UPLOAD_DIR || "./static/uploads",
    baseUrl: process.env.STORAGE_BASE_URL || "/api/files/serve",
    maxFileSize: Number(process.env.STORAGE_MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: (
      process.env.STORAGE_ALLOWED_TYPES || "image/*,application/pdf,video/*"
    ).split(","),
  },

  email: {
    enabled: process.env.EMAIL_ENABLED !== "false",
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.EMAIL_PORT) || 587,
    user: process.env.EMAIL_USER || "",
    pass: process.env.EMAIL_PASS || "",
    from: process.env.EMAIL_FROM || "[EMAIL_ADDRESS]",
  },

  cors: {
    origin: (process.env.CORS_ORIGIN || "*").split(",").map((origin) => {
      logger.info(`Adding CORS origin: ${origin}`);
      return origin.trim();
    }),
    credentials: process.env.CORS_CREDENTIALS === "true",
  },
};
