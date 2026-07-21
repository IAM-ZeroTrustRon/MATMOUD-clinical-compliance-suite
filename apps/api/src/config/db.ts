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
 * Test database connectivity at startup.
 * Runs a single `SELECT 1` to verify the TCP connection, authentication,
 * and database reachability before the server starts accepting requests.
 *
 * Logs a human-readable error on failure instead of a masked AggregateError
 * from pg-pool's internal retry queue.
 *
 * Usage:
 *   await testConnection(); // called from server.ts before app.listen()
 *
 * @returns true if the connection succeeds
 * @throws Error with a descriptive message if the connection fails
 */
export async function testConnection(): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('[DB] PostgreSQL connection verified');
    return true;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown database connection error';
    // Distinguish between TCP-level and auth-level failures
    if (message.includes('connect') || message.includes('ECONNREFUSED')) {
      throw new Error(
        `Cannot reach PostgreSQL at the host/port in DATABASE_URL.\n` +
        `  Detail: ${message}\n` +
        `  Possible causes:\n` +
        `    - PostgreSQL is not running\n` +
        `    - DATABASE_URL points to the wrong host or port\n` +
        `    - A firewall is blocking the connection\n` +
        `    - The Node.js runtime and PostgreSQL are in different network namespaces\n` +
        `       (e.g. Node in Windows, PG in WSL — run both on the same OS)`
      );
    }
    if (message.includes('authentication') || message.includes('password')) {
      throw new Error(
        `PostgreSQL authentication failed. Check the username and password in DATABASE_URL.\n` +
        `  Detail: ${message}`
      );
    }
    if (message.includes('does not exist')) {
      throw new Error(
        `Database or role in DATABASE_URL does not exist.\n` +
        `  Detail: ${message}`
      );
    }
    throw new Error(`PostgreSQL connection failed: ${message}`);
  } finally {
    client.release();
  }
}

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