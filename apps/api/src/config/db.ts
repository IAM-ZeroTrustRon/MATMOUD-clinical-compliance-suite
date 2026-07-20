import { Pool, PoolClient } from 'pg';

/**
 * PostgreSQL connection pool with Row Level Security support.
 *
 * All multi-tenant queries MUST go through getClientForTenant() to ensure
 * the RLS context variable `app.current_tenant_id` is set for the session.
 *
 * The pool enforces:
 * - Dedicated connection per request (via tenant.middleware.ts)
 * - RLS-scoped queries via SET LOCAL
 * - No direct access to the pool from route handlers — always use req.dbClient
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Get a dedicated pool connection with tenant RLS context already set.
 * Used by tenant.middleware.ts to provision req.dbClient.
 *
 * @param tenantId - Validated tenant identifier (alphanumeric, 1-64 chars)
 * @returns PoolClient with active transaction and RLS configuration
 */
export async function getClientForTenant(tenantId: string): Promise<PoolClient> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant_id', tenantId]
    );
    return client;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    throw err;
  }
}

/**
 * Direct pool access — only for use in non-tenant contexts (migrations, health checks).
 * Route handlers MUST NOT use this; they should use req.dbClient from tenant middleware.
 */
export default pool;

