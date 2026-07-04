/**
 * Schema aggregation — re-export every feature's entity module here.
 * drizzle-kit and the relational query builder (populate) both read
 * this file; the export names become the `db.query.<name>` keys.
 */
export * from "@/features/example/entity/example.entity";
