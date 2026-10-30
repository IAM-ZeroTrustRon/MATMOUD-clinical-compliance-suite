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
 * Writers may await req.commitTenantTransaction() before returning success.
 * Otherwise successful responses finalize on finish; error/closed responses
 * roll back. Finalization is idempotent so the connection is released once.
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

    let completion: Promise<void> | undefined;

    function finishTransaction(commit: boolean): Promise<void> {
      if (completion) return completion;
      completion = (async () => {
        try {
          await client.query(commit ? 'COMMIT' : 'ROLLBACK');
        } catch (err) {
          if (commit) await client.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      })();
      return completion;
    }

    function releaseConnection(commit: boolean): void {
      void finishTransaction(commit).catch(() => {
        // Never log driver messages: they can contain connection/record data.
        console.error('[DATABASE] Tenant transaction finalization failed');
      });
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
    req.commitTenantTransaction = () => finishTransaction(true);

    // Fallback cleanup for handlers that have not explicitly finalized.
    res.on('finish', () => releaseConnection(res.statusCode >= 200 && res.statusCode < 300));

    // Roll back and release if the socket closes before the response finishes.
    res.on('close', () => releaseConnection(false));

    next();
  };
}
