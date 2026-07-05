/**
 * App bootstrap — MUST be the first import of src/index.ts.
 * Loads the environment, then initializes the database with the app
 * schema (required before any controller/repository is instantiated).
 */
import { config } from "dotenv";
import { expand } from "dotenv-expand";
import {
  configureCache,
  initializeDatabase,
  RedisCacheStore,
} from "@donilite/wrap";
import * as schemas from "@/db";

expand(config());

if (!process.env.DATABASE_URL) {
  throw new Error("please provide a DATABASE_URL env");
}

initializeDatabase({
  connectionString: process.env.DATABASE_URL,
  schema: schemas,
  logger: process.env.NODE_ENV !== "production",
});

// Cache backend: Redis when REDIS_URL is set, in-memory otherwise.
// Repositories opt in with `cacheTtl`; invalidation is automatic.
if (process.env.REDIS_URL) {
  configureCache({
    store: new RedisCacheStore({ url: process.env.REDIS_URL }),
  });
}
