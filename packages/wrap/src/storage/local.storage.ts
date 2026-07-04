import { mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
import type { StorageProvider, StoredFile } from "./storage.interface";

export interface LocalStorageOptions {
  /** Directory files are written to (default: ./static/uploads) */
  uploadDir?: string;
  /** Public URL prefix returned for stored files (default: /api/files/serve) */
  baseUrl?: string;
}

/**
 * Local file system storage provider
 * Stores files in the configured upload directory
 */
export class LocalStorageProvider implements StorageProvider {
  private uploadDir: string;
  private baseUrl: string;

  constructor(options: LocalStorageOptions = {}) {
    this.uploadDir = options.uploadDir ?? "./static/uploads";
    this.baseUrl = options.baseUrl ?? "/api/files/serve";
    this.ensureUploadDir();
  }

  private async ensureUploadDir(): Promise<void> {
    const isDirectoryExists = await Bun.file(this.uploadDir).exists();
    if (!isDirectoryExists) {
      await mkdir(this.uploadDir, { recursive: true });
    }
  }

  async upload(file: File): Promise<StoredFile> {
    await this.ensureUploadDir();

    const extension = extname(file.name);
    const uniqueName = `${crypto.randomUUID()}${extension}`;
    const storagePath = join(this.uploadDir, uniqueName);

    // Write file to disk using Bun's native file API
    await Bun.write(storagePath, file);

    return {
      originalName: file.name,
      storagePath: uniqueName, // Store relative path for portability
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      publicUrl: this.getPublicUrl(uniqueName),
    };
  }

  async delete(storagePath: string): Promise<boolean> {
    const fullPath = join(this.uploadDir, storagePath);
    try {
      const file = Bun.file(fullPath);
      if (await file.exists()) {
        await Bun.write(fullPath, ""); // Clear content
        const { unlink } = await import("node:fs/promises");
        await unlink(fullPath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async exists(storagePath: string): Promise<boolean> {
    const fullPath = join(this.uploadDir, storagePath);
    const file = Bun.file(fullPath);
    return file.exists();
  }

  getPublicUrl(storagePath: string): string {
    return `${this.baseUrl}/${storagePath}`;
  }

  async getFile(storagePath: string): Promise<{
    file: ReturnType<typeof Bun.file>;
    mimeType: string;
    size: number;
  } | null> {
    const fullPath = join(this.uploadDir, storagePath);
    const file = Bun.file(fullPath);

    if (!(await file.exists())) {
      return null;
    }

    return {
      file,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    };
  }
}
