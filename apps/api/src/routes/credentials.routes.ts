import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { createTenantMiddleware } from '../middleware/tenant.middleware';
import { createAuditMiddleware, auditPhiRead } from '../middleware/audit.middleware';
import { requireRole, requireMinTier, maskPhiFields, ROLES, TIER } from '../middleware/rbac';
import { s3, PutObjectCommand } from '../config/s3';
import { validateMimeType, MAX_FILE_SIZE_BYTES } from '../utils/validator';
import pool from '../config/db';

// ---------------------------------------------------------------------------
// asyncHandler — wraps an async Express route handler so that any rejected
// promise is automatically forwarded to Express error middleware via next(err).
//
// Express 4 does NOT catch promise rejections from async handlers. Without
// this wrapper (or explicit try/catch + next(err) in every handler), a thrown
// error causes an unhandled promise rejection — the request hangs and the
// process logs a DEP0018 deprecation warning.
//
// Usage:
//   router.get('/path', asyncHandler(async (req, res, next) => {
//     const data = await riskyQuery();
//     res.json(data);
//   }));
// ---------------------------------------------------------------------------
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

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
/**
 * TEMPORARY SEED ROUTE
 * POST /credentials/seed
 * Injects a mock credential to test RBAC and PHI masking.
 *
 * This handler uses asyncHandler so that any rejected promise is forwarded
 * to Express error middleware. The INSERT uses ON CONFLICT DO NOTHING to
 * remain idempotent — repeated calls will not fail on duplicate keys.
 *
 * If the table does not exist (relation "credentials" does not exist),
 * run the pending migration first:
 *
 *   npx ts-node src/config/run-migrations.ts
 *
 * Then verify the table:
 *
 *   SELECT column_name, data_type
 *   FROM information_schema.columns
 *   WHERE table_name = 'credentials'
 *   ORDER BY ordinal_position;
 */
router.post(
  '/seed',
  authMiddleware,
  createTenantMiddleware(pool),
  asyncHandler(async (req: Request, res: Response) => {
    const client = req.dbClient!;

    console.log('[SEED] Inserting mock credential for tenant:', req.tenantId);

    const { rows } = await client.query(
      `INSERT INTO credentials (tenant_id, patient_name, dob, ssn, license_number, expiration_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING id, patient_name, dob, ssn, license_number, expiration_date`,
      [req.tenantId, 'Test Patient', '1985-08-22', '000-11-2222', 'CRS-77492', '2028-01-01']
    );

    if (rows.length === 0) {
      res.json({ message: 'Mock data already exists — skipped (idempotent)' });
      return;
    }

    res.status(201).json({ message: 'Mock data injected', record: rows[0] });
  })
);
export default router;

