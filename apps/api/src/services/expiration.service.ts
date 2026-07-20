import { PoolClient } from 'pg';

export interface ExpiringCredential {
  id: string;
  patient_name: string;
  expiration_date: string;
}

/**
 * Retrieves credentials that expire within the given number of days.
 * Respects RLS via req.dbClient — tenant isolation is guaranteed by the middleware chain.
 *
 * @param dbClient - RLS-enabled PostgreSQL client from tenant middleware
 * @param days - Number of days from now to check for expiration
 * @returns Array of expiring credential records (no PHI beyond what's needed for alerting)
 */
export async function getExpiringCredentials(
  dbClient: PoolClient,
  days: number
): Promise<ExpiringCredential[]> {
  const { rows } = await dbClient.query<ExpiringCredential>(
    `SELECT id, patient_name, expiration_date
     FROM credentials
     WHERE expiration_date <= NOW() + ($1 || ' days')::interval
       AND expiration_date > NOW()
     ORDER BY expiration_date ASC`,
    [days]
  );

  return rows;
}

