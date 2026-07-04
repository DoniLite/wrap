/**
 * Database utilities
 */
export class DatabaseHelper {
  /**
   * Execute in transaction
   */
  static async transaction<T>(callback: () => Promise<T>): Promise<T> {
    // Implement transaction logic with your database
    // This is a placeholder
    return callback();
  }

  /**
   * Bulk insert with batch processing
   */
  static async bulkInsert<T>(
    items: T[],
    insertFn: (batch: T[]) => Promise<void>,
    batchSize: number = 100,
  ): Promise<void> {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await insertFn(batch);
    }
  }
}
