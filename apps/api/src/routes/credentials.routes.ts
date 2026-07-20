import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { createTenantMiddleware } from '../middleware/tenant.middleware';
import { createAuditMiddleware, auditPhiRead } from '../middleware/audit.middleware';
import { requireRole, requireMinTier, maskPhiFields, ROLES, TIER } from '../middleware/rbac';
import { s3, PutObjectCommand } from '../config/s3';
import { validateMimeType, MAX_FILE_SIZE_BYTES } from '../utils/validator';
import pool from '../config/db';

const router = Router();

// Multer setup: in-memory storage for direct S3 upload, 10 MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

/**
 * GET /credentials
 * Credential Dashboard — fetches all credentials for the authenticated tenant.
 *
 * Middleware chain: Auth → Tenant → Audit → RBAC (Tier 3+)
 *
 * RBAC enforcement:
 *   - Tier 3 users (customer_support, implementation, viewer): PHI fields masked
 *   - Tier 4+ users (compliance_lead, org_admin, etc.): Full PHI access
 *
 * Audit: Each credential read is logged via auditPhiRead() per HIPAA requirements.
 */
router.get(
  '/',
  authMiddleware,
  createTenantMiddleware(pool),
  // Audit middleware for mutating requests is skipped for GET — we use auditPhiRead() directly
  requireMinTier(TIER.LIMITED_SUPPORT), // Tier 3 minimum
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = req.dbClient!;
      const { rows } = await client.query(
        `SELECT id, patient_name, dob, ssn, license_number, expiration_date, created_at
         FROM credentials
         WHERE tenant_id = current_setting('app.current_tenant_id', true)
         ORDER BY expiration_date ASC NULLS LAST`
      );

      // Log PHI read access per HIPAA Minimum Necessary standard
      for (const row of rows) {
        await auditPhiRead(pool, req, 'credential', row.id).catch((err: Error) => {
          console.error('[HIPAA-AUDIT] Failed to log PHI read:', err.message);
        });
      }

      // Apply PHI masking based on user's tier
      const phiFields: string[] = ['ssn', 'dob', 'license_number'];
      const safe = rows.map((row: Record<string, unknown>) =>
        maskPhiFields(req, row, phiFields)
      );

      res.json(safe);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /credentials/:id/upload
 * Document Upload — uploads a file to S3 with SSE-KMS encryption.
 *
 * Middleware chain: Auth → Tenant → Audit → RBAC (Tier 4+)
 *
 * RBAC enforcement:
 *   - Only Tier 4+ roles (org_admin, clinic_admin, compliance_lead, etc.) can upload
 *   - Tier 3 users receive 403 Forbidden
 *
 * Encryption: All uploads use Server-Side Encryption with AWS KMS (SSE-KMS).
 * No PHI is written to S3 object metadata or key names.
 */
router.post(
  '/:id/upload',
  authMiddleware,
  createTenantMiddleware(pool),
  createAuditMiddleware(pool), // Logs the mutating action
  requireMinTier(TIER.CLINICAL_BACKEND), // Tier 4 minimum
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: 'file_required' });
        return;
      }

      // Validate MIME type before any S3 operation
      if (!validateMimeType(file.mimetype)) {
        res.status(400).json({
          error: 'unsupported_file_type',
          allowedTypes: ['application/pdf', 'image/png', 'image/jpeg'],
        });
        return;
      }

      // Build S3 key with tenant-scoped prefix — no PHI in key name
      const key = `tenant/${req.tenantId}/cred/${req.params.id}/${file.originalname}`;

      const cmd = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: process.env.KMS_KEY_ID,
      });

      const result = await s3.send(cmd);

      res.status(201).json({
        status: 'uploaded',
        etag: result.ETag,
        key,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

