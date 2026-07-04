/**
 * Storage Provider Interface
 * Abstract interface for file storage operations, allowing future migration
 * from local storage to cloud providers (S3, GCS, etc.)
 */

export interface StoredFile {
  originalName: string;
  storagePath: string;
  mimeType: string;
  size: number;
  publicUrl: string;
}

export interface StorageProvider {
  /**
   * Upload a file to storage
   */
  upload(file: File): Promise<StoredFile>;

  /**
   * Delete a file from storage
   */
  delete(storagePath: string): Promise<boolean>;

  /**
   * Check if a file exists in storage
   */
  exists(storagePath: string): Promise<boolean>;

  /**
   * Get the public URL for a stored file
   */
  getPublicUrl(storagePath: string): string;

  /**
   * Get a file from storage for streaming
   * Returns null if the file doesn't exist
   */
  getFile(storagePath: string): Promise<{
    file: ReturnType<typeof Bun.file>;
    mimeType: string;
    size: number;
  } | null>;
}
