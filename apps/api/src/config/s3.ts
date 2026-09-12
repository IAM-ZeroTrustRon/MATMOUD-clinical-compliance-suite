import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * S3 client configured with SSE-KMS for HIPAA encryption-at-rest compliance.
 *
 * All document uploads MUST use:
 * - ServerSideEncryption: 'aws:kms'
 * - SSEKMSKeyId: process.env.KMS_KEY_ID
 *
 * No PHI may be written to S3 object metadata (tags, key names, user-defined fields).
 * Only opaque IDs and tenant-scoped prefixes are permitted in the key.
 */
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Lifetime of a presigned document URL, in seconds.
 *
 * Deliberately short. A presigned URL is a bearer credential: anyone holding
 * the string can fetch the object, with no further authentication and no
 * further audit event. The window is sized to be long enough for the browser
 * to follow the link immediately and short enough that a URL captured from
 * history, a proxy log, or a shared screen is expired by the time it is used.
 *
 * Do not raise this to "make downloads more convenient." If a longer-lived
 * link is ever genuinely needed, stream the object through the API instead so
 * that every retrieval passes back through authorization and audit.
 */
export const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes

/**
 * getSignedDocumentUrl — mint a short-lived presigned GET URL for one object.
 *
 * SECURITY (audit finding MOUD-03):
 *   The document endpoint previously returned the raw S3 object key to the
 *   client. That is not a retrieval mechanism — it exposes internal storage
 *   layout and offers no time limit — and it left the application with no
 *   designed path for reading stored PHI at all.
 *
 *   Callers MUST verify the caller's tier and confirm the object belongs to
 *   the caller's tenant BEFORE calling this function. This function performs
 *   no authorization of its own; it signs whatever key it is given.
 *
 *   The bucket name is read at call time rather than at module load so that a
 *   misconfigured environment fails on the request that needs it, with a clear
 *   error, rather than at import time in unrelated code paths.
 */
export async function getSignedDocumentUrl(key: string): Promise<string> {
  const bucket = process.env.S3_BUCKET;

  if (!bucket) {
    throw new Error('S3_BUCKET is not configured — cannot sign a document URL');
  }

  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(s3, cmd, { expiresIn: SIGNED_URL_TTL_SECONDS });
}

export { s3, PutObjectCommand, GetObjectCommand };
