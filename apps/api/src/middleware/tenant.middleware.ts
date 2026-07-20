import { Request, Response, NextFunction } from 'express';
import { Pool, PoolClient } from 'pg';

// Strict allowlist: tenant IDs are UUIDs or short alphanumeric slugs only.
// This prevents any form of injection into the RLS configuration parameter.
const TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Tenant Data Isolation Middleware (PostgreSQL Row Level Security)
 *
 * Must execute AFTER authMiddleware — requires req.user to be populated.
 *
 * Acquires a dedicated pool connection for this request and sets the
 * PostgreSQL session variable `app.current_tenant_id` using set_config
 * with is_local=true, scoping the value to the current transaction.
 *
 * All subsequent database queries for this request MUST use req.dbClient
 * to guarantee the RLS policy is active. Queries on a fresh pool connection
 * will NOT have the tenant context set and will fail the RLS check.
 *
 * The connection is committed and released when the response finishes,
 * or rolled back and released if the connection closes unexpectedly.
 */
export function createTenantMiddleware(db: Pool) {
  return async function tenantMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: authentication required' });
      return;
    }

    const tenantId = req.user.tenantId;

    if (!tenantId) {
      res.status(403).json({ error: 'Forbidden: tenant context is missing from token' });
      return;
    }

    // Validate format before using in any query, even as a bind parameter.
    if (!TENANT_ID_PATTERN.test(tenantId)) {
      res.status(403).json({ error: 'Forbidden: invalid tenant identifier format' });
      return;
    }

    let client: PoolClient;
    try {
      client = await db.connect();
    } catch (err) {
      next(err);
      return;
    }

    let connectionReleased = false;

    function releaseConnection(commit: boolean): void {
      if (connectionReleased) return;
      connectionReleased = true;

      const cleanup = commit
        ? client.query('COMMIT').catch(() => client.query('ROLLBACK'))
        : client.query('ROLLBACK');

      cleanup
        .catch(() => {/* already rolling back */})
        .finally(() => client.release());
    }

    try {
      // Begin a transaction so SET LOCAL is scoped to this request lifecycle.
      await client.query('BEGIN');

      // set_config(param, value, is_local=true): value lasts only for this transaction.
      // Using parameterised form to guarantee no injection path.
      await client.query(
        'SELECT set_config($1, $2, true)',
        ['app.current_tenant_id', tenantId]
      );
    } catch (err) {
      releaseConnection(false);
      next(err);
      return;
    }

    req.tenantId = tenantId;
    req.dbClient = client;

    // Commit and release after the response is fully sent.
    res.on('finish', () => releaseConnection(true));

    // Roll back and release if the socket closes before the response finishes.
    res.on('close', () => releaseConnection(false));

    next();
  };
}
