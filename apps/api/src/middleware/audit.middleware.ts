import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * HIPAA Audit Logging Middleware
 *
 * Must execute AFTER authMiddleware and tenantMiddleware.
 *
 * Intercepts the response and — for successful mutating requests (2xx) —
 * writes an immutable event to the `audit_events` table.
 *
 * IMPORTANT: audit_events is INSERT-only. The table must have a PostgreSQL
 * row-level security policy and/or a trigger that prevents UPDATE and DELETE.
 * The application DB role must NOT have UPDATE or DELETE privileges on this table.
 *
 * For PHI READ operations: this middleware only covers mutations. Any route
 * that returns PHI must call auditPhiRead() directly from the route handler
 * to ensure read access is also logged per HIPAA Minimum Necessary requirements.
 *
 * Retention: audit_events must be retained for a minimum of 6 years.
 * Implement a time-series partition or archive strategy — never DELETE rows.
 */
export function createAuditMiddleware(db: Pool) {
  return function auditMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (!MUTATING_METHODS.has(req.method)) {
      next();
      return;
    }

    // Capture route path before the response ends (req.route may not be set yet
    // at middleware registration time, so we defer reading it to res.end).
    const originalEnd = res.end.bind(res) as typeof res.end;

    res.end = function (
      ...args: Parameters<typeof res.end>
    ): ReturnType<typeof res.end> {
      const result = originalEnd(...args);

      // Only log if the request succeeded (2xx) and the user was authenticated.
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        const actionType = `${req.method}:${req.route?.path ?? req.path}`;
        const resourceId: string | null = (req.params as Record<string, string>)?.id ?? null;

        // Emit fire-and-forget. Audit failures are logged to stderr and must
        // be monitored via an alerting integration — they must never fail silently.
        db.query(
          `INSERT INTO audit_events
             (user_id, tenant_id, action_type, resource_id, occurred_at, ip_address, http_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            req.user.sub,               // user_id    — Auth0 subject, not PHI
            req.tenantId ?? null,        // tenant_id
            actionType,                  // action_type
            resourceId,                  // resource_id — opaque ID, not PHI value
            new Date().toISOString(),    // occurred_at — ISO 8601 UTC
            req.ip ?? null,              // ip_address
            res.statusCode,              // http_status
          ]
        ).catch((err: Error) => {
          // Log to stderr only. Never surface audit errors to the client —
          // doing so could reveal internal schema details.
          console.error('[HIPAA-AUDIT] Failed to write audit event:', err.message);
        });
      }

      return result;
    };

    next();
  };
}

/**
 * auditPhiRead — call this directly inside any route handler that returns PHI.
 *
 * Usage:
 *   router.get('/credentials/:id', requireRole(...), async (req, res) => {
 *     await auditPhiRead(db, req, 'credential', req.params.id);
 *     // ... fetch and return data
 *   });
 *
 * PHI NOTE: resourceId must be an opaque identifier only — never the PHI value itself.
 */
export async function auditPhiRead(
  db: Pool,
  req: Request,
  resourceType: string,
  resourceId: string
): Promise<void> {
  if (!req.user) return;

  await db.query(
    `INSERT INTO audit_events
       (user_id, tenant_id, action_type, resource_id, occurred_at, ip_address, http_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      req.user.sub,
      req.tenantId ?? null,
      `GET:${resourceType}`,      // action_type
      resourceId,                  // opaque ID — never PHI content // PHI
      new Date().toISOString(),
      req.ip ?? null,
      200,
    ]
  );
}
