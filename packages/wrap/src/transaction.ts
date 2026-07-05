import { AsyncLocalStorage } from "node:async_hooks";
import { getDatabase, type WrapDatabase } from "./database";

interface TransactionContext {
  db: WrapDatabase;
  /** Entity events buffered until the transaction commits. */
  pendingEvents: Array<() => void>;
}

const txStorage = new AsyncLocalStorage<TransactionContext>();

/** The ambient transaction of the current async scope, if any. */
export function currentTransaction(): WrapDatabase | undefined {
  return txStorage.getStore()?.db;
}

/** @internal Buffer a side effect until commit when inside a transaction. */
export function deferUntilCommit(effect: () => void): boolean {
  const ctx = txStorage.getStore();
  if (!ctx) return false;
  ctx.pendingEvents.push(effect);
  return true;
}

/**
 * Run `fn` inside a database transaction, propagated implicitly to every
 * repository/service call in the async scope (AsyncLocalStorage) — no
 * `tx` parameter to thread. A throw rolls everything back. Nested calls
 * join the ambient transaction. Entity events emitted inside the scope
 * are delivered only after the commit succeeds.
 *
 * @example
 * await withTransaction(async () => {
 *   const user = await userRepository.create(dto);
 *   await profileRepository.create(ProfileDTO.from({ userId: user.id }));
 * });
 */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const existing = txStorage.getStore();
  if (existing) {
    // Nested: join the ambient transaction (single commit point)
    return fn();
  }

  const db = getDatabase();
  const context: TransactionContext = {
    db: db as WrapDatabase,
    pendingEvents: [],
  };

  const result = await db.transaction(async (tx) => {
    context.db = tx as unknown as WrapDatabase;
    return txStorage.run(context, fn);
  });

  // Commit succeeded — release the buffered entity events
  for (const effect of context.pendingEvents) {
    try {
      effect();
    } catch {
      // effects are fire-and-forget; failures are the handler's concern
    }
  }

  return result;
}
