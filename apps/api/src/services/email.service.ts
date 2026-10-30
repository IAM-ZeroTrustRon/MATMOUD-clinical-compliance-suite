import sgMail from '@sendgrid/mail';

/**
 * SendGrid email service for compliance alerts.
 *
 * COMPLIANCE: No PHI is ever written into email bodies or subjects.
 * Only opaque identifiers and high-level metadata are included via SendGrid template data.
 * The actual PHI-bearing content must remain in the secure database and be accessed
 * through the authenticated dashboard only.
 */

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export interface AlertEmailData {
  to: string;
  templateId: string;
  dynamicTemplateData: {
    credentialId: string;
    expirationDate: string;
  };
}

/**
 * Sends an expiration alert email via SendGrid.
 *
 * @param data - Destination/template plus a runtime-validated identifier/date allowlist.
 * @throws If SendGrid API call fails
 */
export async function sendExpirationAlert(data: AlertEmailData): Promise<void> {
  const template = data.dynamicTemplateData;
  if (!template || typeof template !== 'object' || Array.isArray(template) ||
      Object.keys(template).length !== 2 ||
      Object.keys(template).some((key) => key !== 'credentialId' && key !== 'expirationDate')) {
    throw new Error('invalid_alert_template_data');
  }
  const { credentialId, expirationDate } = template;
  // Runtime validation matters even when callers bypass TypeScript's shape checks.
  if (typeof credentialId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(credentialId) ||
      typeof expirationDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expirationDate) ||
      !Number.isFinite(Date.parse(`${expirationDate}T00:00:00Z`)) ||
      new Date(`${expirationDate}T00:00:00Z`).toISOString().slice(0, 10) !== expirationDate) {
    throw new Error('invalid_alert_template_data');
  }
  const msg = {
    to: data.to,
    from: process.env.ALERT_FROM_EMAIL || 'alerts@clinical-compliance.com',
    templateId: data.templateId,
    dynamicTemplateData: {
      credentialId,
      expirationDate,
    },
  };

  await sgMail.send(msg);
}
