import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { createTenantMiddleware } from '../middleware/tenant.middleware';
import { requireMinTier, TIER } from '../middleware/rbac';
import pool from '../config/db';

const router = Router();

/**
 * GET /audit-logs
 * Audit Trail Viewer — retrieves HIPAA-compliant audit events for the authenticated tenant.
 *
 * Middleware chain: Auth → Tenant → RBAC (Tier 4+)
 *
 * RBAC enforcement:
 *   - Tier 4+ (org_admin, compliance_lead, clinic_admin, etc.): Full audit log access
 *   - Tier 3 users receive 403 Forbidden
 *
 * Compliance:
 *   - Results are scoped to the authenticated tenant via RLS
 *   - Audit events are immutable INSERT-only records
 *   - Returns: user_id (opaque sub), action_type, resource_id, occurred_at, ip_address, http_status
 *   - No PHI is exposed in audit log responses
 *
 * Query parameters:
 *   - limit (number, default 50): Max records to return
 *   - offset (number, default 0): Pagination offset
 *   - action_type (string, optional): Filter by action type (e.g. "POST:seed", "GET:credential")
 */
router.get(
  '/',
  authMiddleware,
  createTenantMiddleware(pool),
  requireMinTier(TIER.CLINICAL_BACKEND), // Tier 4 minimum for audit access
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = req.dbClient!;

      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 500);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const actionFilter = req.query.action_type as string | undefined;

      let query = `
        SELECT id, user_id, action_type, resource_id, occurred_at, ip_address, http_status
        FROM audit_events
        WHERE tenant_id = current_setting('app.current_tenant_id', true)
      `;
      const params: unknown[] = [];

      if (actionFilter) {
        query += ` AND action_type ILIKE $${params.length + 1}`;
        params.push(`%${actionFilter}%`);
      }

      query += ` ORDER BY occurred_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const { rows } = await client.query(query, params);

      // Get total count for pagination headers
      let countQuery = `
        SELECT COUNT(*) as total
        FROM audit_events
        WHERE tenant_id = current_setting('app.current_tenant_id', true)
      `;
      const countParams: unknown[] = [];

      if (actionFilter) {
        countQuery += ` AND action_type ILIKE $1`;
        countParams.push(`%${actionFilter}%`);
      }

      const { rows: countRows } = await client.query(countQuery, countParams);
      const total = parseInt(countRows[0].total, 10);

      res.set({
        'X-Total-Count': String(total),
        'X-RateLimit-Limit': String(limit),
      });

      res.json({
        data: rows,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

