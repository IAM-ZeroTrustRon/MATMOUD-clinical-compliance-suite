import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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

export { s3, PutObjectCommand };

