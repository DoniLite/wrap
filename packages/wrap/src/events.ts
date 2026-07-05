/**
 * Entity lifecycle events — emitted by BaseRepository after every write.
 * They power automatic cache invalidation and realtime publication, and
 * are open to app handlers (side effects, domain events, audit, ...).
 *
 * Inside a transaction, events are buffered and delivered only after the
 * commit succeeds (see transaction.ts).
 */
import { getTableName } from "drizzle-orm";
import type { EntityLike } from "./entity";
import { deferUntilCommit } from "./transaction";
import { logger } from "./logger";

export type EntityEventType = "created" | "updated" | "deleted";

export interface EntityEvent<T = unknown> {
  type: EntityEventType;
  /** SQL table name of the entity */
  table: string;
  /** created/updated: the row(s); deleted: `{ ids }` */
  data: T;
}

export type EntityEventHandler = (
  event: EntityEvent,
) => void | Promise<void>;

const WILDCARD = "*";
const handlers = new Map<string, Set<EntityEventHandler>>();

function tableNameOf(source: string | EntityLike): string {
  return typeof source === "string" ? source : getTableName(source.table);
}

/**
 * Listen to the lifecycle events of an entity (class, table name, or
 * `"*"` for every entity). Returns an unsubscribe function.
 *
 * @example
 * onEntityEvent(Example, (event) => { ... });
 * onEntityEvent("*", (event) => audit(event));
 */
export function onEntityEvent(
  source: string | EntityLike,
  handler: EntityEventHandler,
): () => void {
  const key = tableNameOf(source);
  const set = handlers.get(key) ?? new Set();
  set.add(handler);
  handlers.set(key, set);
  return () => {
    set.delete(handler);
  };
}

function dispatch(event: EntityEvent): void {
  const targets = [
    ...(handlers.get(event.table) ?? []),
    ...(handlers.get(WILDCARD) ?? []),
  ];
  for (const handler of targets) {
    try {
      const result = handler(event);
      if (result instanceof Promise) {
        result.catch((error) =>
          logger.warn(`Entity event handler failed for ${event.table}`, {
            type: event.type,
          }, error),
        );
      }
    } catch (error) {
      logger.warn(`Entity event handler failed for ${event.table}`, {
        type: event.type,
      }, error);
    }
  }
}

/**
 * Emit an entity event (used by BaseRepository; apps can emit custom
 * ones too). Buffered until commit when inside a transaction.
 */
export function emitEntityEvent(event: EntityEvent): void {
  if (deferUntilCommit(() => dispatch(event))) return;
  dispatch(event);
}
