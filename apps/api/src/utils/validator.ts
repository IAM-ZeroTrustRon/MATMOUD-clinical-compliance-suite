/**
 * Allowed MIME types for document uploads.
 * Only types that cannot carry executable content are permitted.
 */
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/**
 * Validates that a MIME type is in the allowed list.
 * Used by the document upload route to reject unsupported file types before S3 upload.
 *
 * @param mimeType - The MIME type string from the uploaded file
 * @returns boolean indicating whether the type is permitted
 */
export function validateMimeType(mimeType: string): mimeType is AllowedMimeType {
  return ALLOWED_MIME_TYPES.includes(mimeType as AllowedMimeType);
}

/**
 * Maximum file size for document uploads: 10 MB.
 * Prevents large file attacks and runaway S3 costs.
 */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

