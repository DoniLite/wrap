/**
 * Converts a base64 encoded image string to a Buffer (bytes)
 * Useful for saving images to the file system or database
 *
 * @param base64String - The base64 encoded image string (with or without data URI prefix)
 * @returns Buffer containing the image bytes
 *
 * @example
 * ```ts
 * const base64 = "data:image/png;base64,iVBORw0KGgoAAAANS...";
 * const imageBuffer = base64ToBytes(base64);
 * // Save to file system
 * await Bun.write("image.png", imageBuffer);
 * ```
 */
export function base64ToBytes(base64String: string): Buffer {
  // Remove data URI prefix if present (e.g., "data:image/png;base64,")
  const base64Data = base64String.includes(",")
    ? (base64String.split(",")[1] as string)
    : base64String;

  // Convert base64 to Buffer
  return Buffer.from(base64Data, "base64");
}

/**
 * Extracts the MIME type from a base64 data URI
 *
 * @param base64String - The base64 encoded image string with data URI prefix
 * @returns MIME type (e.g., "image/png", "image/jpeg") or null if not found
 *
 * @example
 * ```ts
 * const base64 = "data:image/png;base64,iVBORw0KGgoAAAANS...";
 * const mimeType = getMimeTypeFromBase64(base64); // "image/png"
 * ```
 */
export function getMimeTypeFromBase64(
  base64String: string,
): string | null | undefined {
  const matches = base64String.match(/^data:([^;]+);base64,/);
  return matches ? matches[1] : null;
}

/**
 * Gets file extension from MIME type
 *
 * @param mimeType - MIME type (e.g., "image/png")
 * @returns File extension (e.g., "png") or "bin" if unknown
 *
 * @example
 * ```ts
 * const ext = getExtensionFromMimeType("image/jpeg"); // "jpg"
 * ```
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
  };

  return mimeToExt[mimeType.toLowerCase()] || "bin";
}

/**
 * Saves a base64 image to a file
 *
 * @param base64String - The base64 encoded image string
 * @param outputPath - Path where the file should be saved
 * @returns Promise that resolves when file is written
 *
 * @example
 * ```ts
 * const base64 = "data:image/png;base64,iVBORw0KGgoAAAANS...";
 * await saveBase64ToFile(base64, "/uploads/avatar-123.png");
 * ```
 */
export async function saveBase64ToFile(
  base64String: string,
  outputPath: string,
): Promise<void> {
  const imageBuffer = base64ToBytes(base64String);
  await Bun.write(outputPath, imageBuffer);
}

/**
 * Generates a unique filename for an image based on timestamp and random string
 *
 * @param base64String - The base64 encoded image string (to extract mime type)
 * @param prefix - Optional prefix for the filename
 * @returns Unique filename with appropriate extension
 *
 * @example
 * ```ts
 * const filename = generateUniqueFilename("data:image/png;base64,...", "avatar");
 * // Returns something like: "avatar-1702659123456-a3b2c1.png"
 * ```
 */
export function generateUniqueFilename(
  base64String: string,
  prefix = "image",
): string {
  const mimeType = getMimeTypeFromBase64(base64String);
  const extension = mimeType ? getExtensionFromMimeType(mimeType) : "bin";
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);

  return `${prefix}-${timestamp}-${randomStr}.${extension}`;
}
