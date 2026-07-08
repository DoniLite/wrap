/**
 * App bootstrap — MUST be the first import of src/index.ts.
 *
 * Lightweight-API profile: no database, no cache backend to configure —
 * `@donilite/wrap`'s repository/cache machinery is entirely opt-in (see
 * `RouterController`/`WrapService`, which don't require either), so there
 * is nothing here beyond loading the environment. If this project later
 * needs Postgres, add `initializeDatabase({...})` back the way the
 * full-backend profile does (see that profile's `src/bootstrap.ts`).
 */
import { config } from "dotenv";
import { expand } from "dotenv-expand";

expand(config());
