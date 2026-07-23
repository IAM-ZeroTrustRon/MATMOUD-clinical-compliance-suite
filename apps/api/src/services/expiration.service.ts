import { PoolClient } from 'pg';

export interface ExpiringCredential {
  id: string;
  patient_name: string;
  expiration_date: string;
}

/**
 * Retrieves credentials that expire within the given number of days,
 * skipping any that have already been alerted (last_alerted_at IS NULL).
 *
 * Respects RLS via req.dbClient — tenant isolation is guaranteed by the middleware chain.
 *
 * DEDUP: The `WHERE last_alerted_at IS NULL` filter ensures each credential receives
 * exactly one alert per expiration window. After sending an alert, the caller must
 * UPDATE credentials SET last_alerted_at = NOW() WHERE id = $1.
 *
 * KNOWN GAP: When a credential is renewed (expiration_date updated), last_alerted_at
 * must be reset to NULL to allow a new alert cycle. This reset should be added to
 * the renewal/update endpoint when it's built.
 *
 * @param dbClient - RLS-enabled PostgreSQL client from tenant middleware / getClientForTenant
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
       AND last_alerted_at IS NULL
     ORDER BY expiration_date ASC`,
    [days]
  );

  return rows;
}

/**
 * Marks a credential as having received its expiration alert.
 * Call this AFTER sendExpirationAlert succeeds to prevent duplicate alerts.
 *
 * @param dbClient - RLS-enabled PostgreSQL client
 * @param credentialId - UUID of the credential to mark
 */
export async function markAlertSent(
  dbClient: PoolClient,
  credentialId: string
): Promise<void> {
  await dbClient.query(
    'UPDATE credentials SET last_alerted_at = NOW() WHERE id = $1',
    [credentialId]
  );
}

