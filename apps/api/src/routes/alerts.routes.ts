import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { createTenantMiddleware } from '../middleware/tenant.middleware';
import { createAuditMiddleware, auditPhiRead } from '../middleware/audit.middleware';
import { requireRole, ROLES } from '../middleware/rbac';
import { getExpiringCredentials, markAlertSent } from '../services/expiration.service';
import { sendExpirationAlert } from '../services/email.service';
import pool from '../config/db';

const router = Router();

/**
 * POST /alerts/run
 * Email Alerts Workflow — checks for expiring credentials and sends SendGrid alerts.
 *
 * Middleware chain: Auth → Tenant → Audit → RBAC (compliance_lead)
 *
 * Compliance requirements:
 *   - No PHI in email bodies or subjects (uses SendGrid template IDs only)
 *   - Audit events logged for every alert run
 *   - Only compliance_lead role can trigger alerts
 *   - RLS enforced — only credentials within the tenant scope are evaluated
 */
router.post(
  '/run',
  authMiddleware,
  createTenantMiddleware(pool),
  createAuditMiddleware(pool), // Logs the alert_run mutation
  requireRole(ROLES.COMPLIANCE_LEAD),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const days: number = req.body.days ?? 30;

      if (typeof days !== 'number' || days < 1 || days > 365) {
        res.status(400).json({
          error: 'invalid_days',
          message: 'Days must be a number between 1 and 365',
        });
        return;
      }

      const client = req.dbClient!;

      // Fetch expiring credentials (RLS-scoped via req.dbClient)
      const expiringCreds = await getExpiringCredentials(client, days);

      // Send alerts
      const sendResults: Array<{
        credentialId: string; success: boolean; emailed: boolean; audited: boolean;
        error?: string;
      }> = [];

      for (const cred of expiringCreds) {
        let emailed = false;
        let audited = false;
        try {
          await sendExpirationAlert({
            to: process.env.ALERT_RECIPIENT_EMAIL || '',
            templateId: process.env.SENDGRID_TEMPLATE_ID || '',
            dynamicTemplateData: {
              credentialId: cred.id,
              expirationDate: cred.expiration_date,
            },
          });
          emailed = true;

          // Delivery cannot be undone. Expose audit failure without misreporting
          // the delivered message as unsent or returning raw provider/DB errors.
          try {
            await auditPhiRead(pool, req, 'alert_sent', cred.id);
            audited = true;
          } catch {
            console.error('[HIPAA-AUDIT] Failed to log alert send');
          }

          // Keep deduplication even if the separate audit write failed.
          await markAlertSent(client, cred.id);
          sendResults.push({ credentialId: cred.id, success: audited, emailed, audited,
            ...(!audited ? { error: 'alert_audit_failed' } : {}) });
        } catch {
          console.error('[ALERT] Alert processing failed');
          sendResults.push({ credentialId: cred.id, success: false, emailed, audited,
            error: emailed ? 'alert_tracking_failed' : 'alert_send_failed' });
        }
      }

      res.json({
        status: sendResults.some((r) => !r.success) ? 'completed_with_errors' : 'completed',
        total: expiringCreds.length,
        sent: sendResults.filter((r) => r.emailed).length,
        failed: sendResults.filter((r) => !r.emailed).length,
        auditFailed: sendResults.filter((r) => r.emailed && !r.audited).length,
        trackingFailed: sendResults.filter((r) => r.error === 'alert_tracking_failed').length,
        results: sendResults,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

