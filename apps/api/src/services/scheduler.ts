import cron from 'node-cron';
import { getClientForTenant } from '../config/db';
import { getExpiringCredentials, markAlertSent } from './expiration.service';
import { sendExpirationAlert, validateNoPhiInTemplateData } from './email.service';

/**
 * Scheduler service for compliance alerts.
 *
 * Runs daily at 08:00 UTC to check for credentials expiring within 30 days
 * and sends SendGrid alerts to the configured recipient.
 *
 * Tenant Context:
 *   The scheduler reads TENANT_ID from the environment and uses
 *   getClientForTenant() to establish the proper RLS session context
 *   (BEGIN + SET LOCAL app.current_tenant_id). This ensures the query
 *   respects Row Level Security and only returns credentials belonging
 *   to the configured tenant.
 *
 *   FUTURE: When a tenants table exists, this should loop over all tenants
 *   instead of reading a single TENANT_ID. Until then, deploy one scheduler
 *   process per tenant in multi-tenant environments.
 *
 * Deduplication:
 *   The query includes `AND last_alerted_at IS NULL` so each credential
 *   receives exactly one alert per expiration window. After a successful
 *   send, last_alerted_at is set to NOW().
 *
 *   KNOWN GAP: When a credential is renewed (expiration_date updated),
 *   last_alerted_at must be reset to NULL. Add this to the renewal endpoint
 *   when it's built.
 *
 * COMPLIANCE:
 *   - No PHI in email bodies (only credentialId + expirationDate)
 *   - Each credential's template data is validated before sending
 *   - Errors are logged but do not crash the scheduler
 *
 * To disable, set ALERTS_CRON_SCHEDULE to an empty string or remove it.
 */
const DEFAULT_SCHEDULE = '0 8 * * *'; // daily at 08:00 UTC

export function startAlertScheduler(): void {
  const schedule = process.env.ALERTS_CRON_SCHEDULE || DEFAULT_SCHEDULE;

  if (!schedule) {
    console.log('[SCHEDULER] ALERTS_CRON_SCHEDULE is empty — alerts scheduler disabled.');
    return;
  }

  if (!cron.validate(schedule)) {
    console.error(`[SCHEDULER] Invalid cron expression: "${schedule}" — alerts scheduler disabled.`);
    return;
  }

  const tenantId = process.env.TENANT_ID;
  if (!tenantId) {
    console.error('[SCHEDULER] TENANT_ID is not set — alerts scheduler cannot establish RLS context. Aborting.');
    return;
  }

  console.log(`[SCHEDULER] Starting alert scheduler for tenant ${tenantId} with schedule: ${schedule}`);

  cron.schedule(schedule, async () => {
    console.log(`[SCHEDULER] Running scheduled alert check for tenant ${tenantId}...`);

    let client;
    try {
      // Get a dedicated connection with RLS context set via SET LOCAL
      client = await getClientForTenant(tenantId);

      const days = 30;
      // getExpiringCredentials now includes AND last_alerted_at IS NULL
      const expiringCreds = await getExpiringCredentials(client, days);

      if (expiringCreds.length === 0) {
        console.log('[SCHEDULER] No un-alerted expiring credentials found.');
        await client.query('COMMIT');
        return;
      }

      // Validate template data before sending (denylist check)
      const templateData = expiringCreds.map((cred) => ({
        credentialId: cred.id,
        expirationDate: cred.expiration_date,
      }));

      for (const data of templateData) {
        validateNoPhiInTemplateData(data);
      }

      // Send alerts
      let sent = 0;
      let failed = 0;

      for (const cred of expiringCreds) {
        try {
          await sendExpirationAlert({
            to: process.env.ALERT_RECIPIENT_EMAIL || '',
            templateId: process.env.SENDGRID_TEMPLATE_ID || '',
            dynamicTemplateData: {
              credentialId: cred.id,
              expirationDate: cred.expiration_date,
            },
          });

          // Mark as alerted to prevent duplicate sends on the next run
          await markAlertSent(client, cred.id);

          sent++;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'unknown_error';
          console.error('[SCHEDULER] Failed to send alert for credential', cred.id, ':', message);
          failed++;
        }
      }

      console.log(`[SCHEDULER] Alert run complete: ${sent} sent, ${failed} failed`);

      // Commit the RLS transaction (marks are persisted)
      await client.query('COMMIT');
    } catch (err) {
      console.error('[SCHEDULER] Alert run failed:', err);
    } finally {
      if (client) {
        // Rollback if anything is still open, then release
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        client.release();
      }
    }
  });
}