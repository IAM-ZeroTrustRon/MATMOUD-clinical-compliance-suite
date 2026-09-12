import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { createTenantMiddleware } from '../middleware/tenant.middleware';
import { createAuditMiddleware, auditPhiRead } from '../middleware/audit.middleware';
import { requireRole, requireMinTier, maskPhiFields, ROLES, TIER } from '../middleware/rbac';
import { s3, PutObjectCommand, getSignedDocumentUrl, SIGNED_URL_TTL_SECONDS } from '../config/s3';
import { validateUpload, ALLOWED_TYPES_FOR_DISPLAY, MAX_FILE_SIZE_BYTES } from '../utils/validator';
import pool from '../config/db';
import { randomUUID } from 'crypto';

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
        `SELECT id, provider_name, dob, ssn, license_number, expiration_date, document_key, created_at
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
      const phiFields: string[] = ['provider_name', 'ssn', 'dob', 'license_number'];
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

      // MOUD-04: validate the DECLARED type, the ACTUAL bytes, and that the two
      // agree — before any S3 operation. The client-asserted Content-Type alone
      // is not a security control; a client can claim whatever it likes.
      const validation = validateUpload(file.mimetype, file.buffer);

      if (!validation.ok) {
        res.status(400).json({
          error: validation.error,
          allowedTypes: ALLOWED_TYPES_FOR_DISPLAY,
        });
        return;
      }

      // MOUD-05: the S3 key is generated server-side and contains no
      // user-supplied input. The uploaded filename previously flowed straight
      // into the key, which put identifying information ("Jane-Doe-SSN.pdf")
      // into bucket listings, access logs, and CloudTrail events — none of
      // which are treated as PHI stores. For substance use disorder records the
      // association of a patient with this system is itself the protected fact
      // (42 CFR Part 2), so the original filename is discarded rather than
      // stored in the path. The extension comes from the DETECTED type, not
      // from the filename.
      const key = `tenant/${req.tenantId}/cred/${req.params.id}/${randomUUID()}.${validation.extension}`;

      const cmd = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: file.buffer,
        // Store the detected type, not the claimed one — this is what the
        // object will later be served as.
        ContentType: validation.mimeType,
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: process.env.KMS_KEY_ID,
      });

      const result = await s3.send(cmd);

      // Persist the document key on the credential record
      await pool.query(
        `UPDATE credentials SET document_key = $1 WHERE id = $2 AND tenant_id = current_setting('app.current_tenant_id', true)`,
        [key, req.params.id]
      );

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
 * POST /credentials
 * Create a new credential record.
 *
 * Middleware chain: Auth → Tenant → Audit → RBAC (Tier 4+)
 *
 * Body: { provider_name, license_number, expiration_date, ssn?, dob? }
 */
router.post(
  '/',
  authMiddleware,
  createTenantMiddleware(pool),
  createAuditMiddleware(pool),
  requireMinTier(TIER.CLINICAL_BACKEND),
  asyncHandler(async (req: Request, res: Response) => {
    const { provider_name, license_number, expiration_date, ssn, dob } = req.body;

    if (!provider_name || !license_number || !expiration_date) {
      res.status(400).json({ error: 'provider_name, license_number, and expiration_date are required' });
      return;
    }

    const client = req.dbClient!;
    const { rows } = await client.query(
      `INSERT INTO credentials (tenant_id, provider_name, license_number, expiration_date, ssn, dob)
       VALUES (current_setting('app.current_tenant_id', true), $1, $2, $3, $4, $5)
       RETURNING id, provider_name, license_number, expiration_date, created_at`,
      [provider_name, license_number, expiration_date, ssn ?? null, dob ?? null]
    );

    res.status(201).json(rows[0]);
  })
);

/**
 * GET /credentials/:id/document
 * Issue a short-lived presigned URL for a credential's uploaded document.
 *
 * Middleware chain: Auth → Tenant → RBAC (Tier 4+)
 *
 * SECURITY (audit findings MOUD-03 and MOUD-07):
 *
 *   MOUD-03 — This endpoint previously returned the raw S3 object key. The
 *   frontend expected a usable URL, so the feature was broken, and more
 *   importantly the application had no designed mechanism for retrieving
 *   stored PHI. It now returns a presigned GET URL valid for
 *   SIGNED_URL_TTL_SECONDS. The raw key is never sent to the client.
 *
 *   MOUD-07 — createAuditMiddleware only covers mutating methods, so this GET
 *   produced no audit record. Retrieving a PHI document is the single most
 *   sensitive read in this application and must be attributable.
 *
 *   The audit write is intentionally AWAITED and fails closed: if the audit
 *   event cannot be written, no URL is minted and the request returns 503.
 *   This differs deliberately from the fire-and-forget logging on the list
 *   route. Releasing a PHI document without a corresponding audit record is
 *   precisely the outcome the audit trail exists to prevent, and in a product
 *   whose compliance value rests on that trail, a failed audit is a failed
 *   request — not a warning on stderr.
 *
 *   Tenant scoping is enforced in the WHERE clause AND by the RLS policy on
 *   `credentials`, so a caller cannot obtain a URL for another tenant's object.
 */
router.get(
  '/:id/document',
  authMiddleware,
  createTenantMiddleware(pool),
  requireMinTier(TIER.CLINICAL_BACKEND),
  asyncHandler(async (req: Request, res: Response) => {
    const client = req.dbClient!;
    const { rows } = await client.query(
      `SELECT document_key FROM credentials
       WHERE id = $1 AND tenant_id = current_setting('app.current_tenant_id', true)`,
      [req.params.id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'credential_not_found' });
      return;
    }

    if (!rows[0].document_key) {
      res.status(404).json({ error: 'no_document_uploaded' });
      return;
    }

    // Audit BEFORE the URL exists — never mint a credential we failed to log.
    try {
      await auditPhiRead(pool, req, 'credential_document', req.params.id);
    } catch (err) {
      console.error(
        '[HIPAA-AUDIT] Refusing to issue document URL — audit write failed:',
        err instanceof Error ? err.message : String(err)
      );
      res.status(503).json({ error: 'audit_unavailable' });
      return;
    }

    const url = await getSignedDocumentUrl(rows[0].document_key);

    res.json({ url, expiresIn: SIGNED_URL_TTL_SECONDS });
  })
);

/**
 * DEVELOPMENT-ONLY SEED ROUTE
 * POST /credentials/seed
 * Injects a mock credential to test RBAC and PHI masking.
 *
 * SECURITY (audit finding MOUD-02):
 *   This route is NOT registered when NODE_ENV === 'production'. The route
 *   previously relied on a client-side check (import.meta.env.DEV) to hide
 *   the button in the frontend build, which is not an access control — the
 *   endpoint itself remained reachable in production by any authenticated
 *   user of any tier, and wrote credential rows with no audit record.
 *
 *   Two layers now apply:
 *     1. Server-side registration guard — in production the route does not
 *        exist at all and returns 404.
 *     2. Even in non-production it requires Tier 4 (CLINICAL_BACKEND) and is
 *        wrapped in createAuditMiddleware, so every seed write is attributed
 *        and logged like any other mutation.
 *
 * Do not remove the NODE_ENV guard to "make testing easier" in a deployed
 * environment. If seeded data is needed against a deployed database, run the
 * migration/seed script out-of-band rather than exposing an HTTP endpoint.
 *
 * If the table does not exist (relation "credentials" does not exist),
 * run the pending migration first:
 *
 *   npx ts-node src/config/run-migrations.ts
 */
if (process.env.NODE_ENV !== 'production') {
  router.post(
    '/seed',
    authMiddleware,
    createTenantMiddleware(pool),
    createAuditMiddleware(pool),
    requireMinTier(TIER.CLINICAL_BACKEND),
    asyncHandler(async (req: Request, res: Response) => {
      const client = req.dbClient!;

      console.log('[SEED] Inserting mock credential for tenant:', req.tenantId);

      const { rows } = await client.query(
        `INSERT INTO credentials (tenant_id, provider_name, license_number, expiration_date)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING
         RETURNING id, provider_name, license_number, expiration_date`,
        [req.tenantId, 'Test Provider RN', 'CRS-77492', '2028-01-01']
      );

      if (rows.length === 0) {
        res.json({ message: 'Mock data already exists — skipped (idempotent)' });
        return;
      }

      res.status(201).json({ message: 'Mock data injected', record: rows[0] });
    })
  );
} else {
  console.warn('[SECURITY] Seed route not registered — NODE_ENV is production.');
}

export default router;

