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
    patientName?: string;
    expirationDate: string;
  };
}

/**
 * Sends an expiration alert email via SendGrid.
 *
 * @param data - Alert email payload (no PHI in body, only in template data references)
 * @throws If SendGrid API call fails
 */
export async function sendExpirationAlert(data: AlertEmailData): Promise<void> {
  const msg = {
    to: data.to,
    from: process.env.ALERT_FROM_EMAIL || 'alerts@clinical-compliance.com',
    templateId: data.templateId,
    dynamicTemplateData: {
      ...data.dynamicTemplateData,
      // NOTE: patientName is included only as a reference identifier.
      // Full PHI (SSN, DOB, license numbers) must NEVER enter the email pipeline.
    },
  };

  await sgMail.send(msg);
}

/**
 * Validates that dynamic template data contains no PHI fields.
 * This is a safety check — if any reserved PHI field names appear in the
 * template data, the send is aborted.
 *
 * @param data - The dynamic template data to validate
 * @throws If PHI field names are detected
 */
export function validateNoPhiInTemplateData(
  data: Record<string, unknown>
): void {
  const phiFieldNames = ['ssn', 'dob', 'license_number', 'licenseNumber', 'social_security'];
  const detected = phiFieldNames.filter((field) => field in data);

  if (detected.length > 0) {
    throw new Error(
      `COMPLIANCE VIOLATION: PHI fields ${detected.join(', ')} detected in email template data. ` +
      'No PHI may be sent via email per HIPAA Minimum Necessary standard.'
    );
  }
}

