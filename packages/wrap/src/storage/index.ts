export * from "./storage.interface";
export * from "./local.storage";

import type { StorageProvider } from "./storage.interface";
import {
  LocalStorageProvider,
  type LocalStorageOptions,
} from "./local.storage";

export interface StorageOptions extends LocalStorageOptions {
  provider?: "local";
  // Future: Add S3, GCS providers here
}

let storageInstance: StorageProvider | null = null;

/**
 * Configure the storage provider from app config — call at bootstrap
 * (optional: without it, a local provider with defaults is used).
 */
export function configureStorage(
  options: StorageOptions = {},
): StorageProvider {
  switch (options.provider ?? "local") {
    case "local":
    default:
      storageInstance = new LocalStorageProvider(options);
  }
  return storageInstance;
}

/**
 * Get the configured storage provider instance (singleton)
 */
export function getStorageProvider(): StorageProvider {
  if (!storageInstance) {
    storageInstance = new LocalStorageProvider();
  }
  return storageInstance;
}
