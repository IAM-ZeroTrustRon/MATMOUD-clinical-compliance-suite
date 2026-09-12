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
 * Validates that a MIME type string is in the allowed list.
 *
 * IMPORTANT: this checks the CLIENT-ASSERTED Content-Type header only. It is a
 * cheap first filter, not a security control — a client can claim any type it
 * likes. Always pair it with detectFileType(), which inspects the actual bytes.
 * See validateUpload() below, which enforces both together.
 */
export function validateMimeType(mimeType: string): mimeType is AllowedMimeType {
  return ALLOWED_MIME_TYPES.includes(mimeType as AllowedMimeType);
}

/**
 * Magic-byte signatures for the permitted file types (audit finding MOUD-04).
 *
 * Why a hand-rolled sniffer instead of a library:
 *   Only three types are permitted, and their signatures are short, stable, and
 *   specified in the respective format standards. Adding a dependency to a
 *   PHI-handling service carries supply-chain and maintenance cost that is not
 *   justified by ~15 lines of byte comparison — and this codebase already
 *   carries an audit finding for an unused dependency. Explicit signatures are
 *   also directly auditable: a reviewer can verify them against the format
 *   specs without reading a third-party package.
 *
 * If the allow-list ever grows beyond a handful of simple formats (Office
 * documents, for example, are ZIP containers and need real parsing), replace
 * this with a maintained library rather than extending the table.
 *
 * Signatures:
 *   PDF   25 50 44 46 2D                 "%PDF-"
 *   PNG   89 50 4E 47 0D 0A 1A 0A        PNG 8-byte signature
 *   JPEG  FF D8 FF                       SOI marker + first marker byte
 */
const FILE_SIGNATURES: ReadonlyArray<{
  mimeType: AllowedMimeType;
  bytes: readonly number[];
}> = [
  { mimeType: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { mimeType: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

/**
 * detectFileType — identify a file from its leading bytes.
 *
 * Returns the detected MIME type, or null if the content does not match any
 * permitted signature. Fails closed: an empty, truncated, or unrecognized
 * buffer returns null rather than falling through to a default.
 */
export function detectFileType(buffer: Buffer): AllowedMimeType | null {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return null;
  }

  for (const signature of FILE_SIGNATURES) {
    if (buffer.length < signature.bytes.length) {
      continue;
    }

    let matches = true;
    for (let i = 0; i < signature.bytes.length; i += 1) {
      if (buffer[i] !== signature.bytes[i]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return signature.mimeType;
    }
  }

  return null;
}

export type UploadValidationResult =
  | { ok: true; mimeType: AllowedMimeType; extension: string }
  | { ok: false; error: 'unsupported_file_type' | 'content_type_mismatch' };

/**
 * File extension to use for each permitted type.
 *
 * Derived from the DETECTED type, never from the uploaded filename — the
 * filename is attacker-controlled and, in a clinical setting, frequently
 * contains patient-identifying information (audit finding MOUD-05).
 */
const EXTENSION_FOR_TYPE: Record<AllowedMimeType, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/**
 * validateUpload — the single entry point the upload route should use.
 *
 * Enforces three things together (audit finding MOUD-04):
 *   1. The client-declared Content-Type is in the allow-list.
 *   2. The actual leading bytes match a permitted signature.
 *   3. The two agree with each other.
 *
 * Rule 3 matters independently of rules 1 and 2. A file whose bytes are a valid
 * PNG but which is declared as application/pdf is rejected, because a mismatch
 * between what a client claims and what it sent is itself a signal worth
 * refusing — and because downstream consumers will serve the object under the
 * stored content type.
 *
 * On success the caller gets the DETECTED type and its canonical extension,
 * both of which should be used in preference to anything the client supplied.
 */
export function validateUpload(
  declaredMimeType: string,
  buffer: Buffer
): UploadValidationResult {
  if (!validateMimeType(declaredMimeType)) {
    return { ok: false, error: 'unsupported_file_type' };
  }

  const detected = detectFileType(buffer);

  if (detected === null) {
    return { ok: false, error: 'unsupported_file_type' };
  }

  if (detected !== declaredMimeType) {
    return { ok: false, error: 'content_type_mismatch' };
  }

  return { ok: true, mimeType: detected, extension: EXTENSION_FOR_TYPE[detected] };
}

/**
 * The permitted types, exposed for error responses so the route and the
 * validator cannot drift out of sync.
 */
export const ALLOWED_TYPES_FOR_DISPLAY: readonly string[] = ALLOWED_MIME_TYPES;

/**
 * Maximum file size for document uploads: 10 MB.
 * Prevents large file attacks and runaway S3 costs.
 */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
