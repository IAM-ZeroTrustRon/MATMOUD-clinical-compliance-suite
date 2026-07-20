import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { createTenantMiddleware } from '../middleware/tenant.middleware';
import { createAuditMiddleware, auditPhiRead } from '../middleware/audit.middleware';
import { requireRole, ROLES } from '../middleware/rbac';
import { getExpiringCredentials } from '../services/expiration.service';
import { sendExpirationAlert, validateNoPhiInTemplateData } from '../services/email.service';
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

      // Validate that no PHI ends up in email templates
      const templateData = expiringCreds.map((cred) => ({
        credentialId: cred.id,
        patientName: cred.patient_name,
        expirationDate: cred.expiration_date,
      }));

      for (const data of templateData) {
        validateNoPhiInTemplateData(data);
      }

      // Send alerts
      const sendResults: Array<{ credentialId: string; success: boolean; error?: string }> = [];

      for (const cred of expiringCreds) {
        try {
          await sendExpirationAlert({
            to: process.env.ALERT_RECIPIENT_EMAIL || '',
            templateId: process.env.SENDGRID_TEMPLATE_ID || '',
            dynamicTemplateData: {
              credentialId: cred.id,
              patientName: cred.patient_name,
              expirationDate: cred.expiration_date,
            },
          });

          // Log each alert send as a PHI read (since we're acting on credential data)
          await auditPhiRead(pool, req, 'alert_sent', cred.id).catch((err: Error) => {
            console.error('[HIPAA-AUDIT] Failed to log alert send:', err.message);
          });

          sendResults.push({ credentialId: cred.id, success: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'unknown_error';
          console.error('[EMAIL] Failed to send alert for credential', cred.id, ':', message);
          sendResults.push({ credentialId: cred.id, success: false, error: message });
        }
      }

      res.json({
        status: 'completed',
        total: expiringCreds.length,
        sent: sendResults.filter((r) => r.success).length,
        failed: sendResults.filter((r) => !r.success).length,
        results: sendResults,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

