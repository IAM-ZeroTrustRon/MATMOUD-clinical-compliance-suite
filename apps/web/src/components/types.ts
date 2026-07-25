export interface Credential {
  id: string;
  provider_name: string; // PHI
  dob: string | null; // PHI
  ssn: string | null; // PHI
  license_number: string; // PHI
  expiration_date: string;
  document_key: string | null;
  created_at: string;
}

export interface AuditEvent {
  id: number;
  user_id: string;
  action_type: string;
  resource_id: string | null;
  occurred_at: string;
  ip_address: string | null;
  http_status: number;
}

export type ComplianceStatus = 'compliant' | 'expiring' | 'expired';

/** Shared 30-day threshold — must match the backend's expiration.service.ts window. */
export const EXPIRING_SOON_DAYS = 30;

export function getComplianceStatus(expirationDate: string): ComplianceStatus {
  const now = new Date();
  const exp = new Date(expirationDate);
  const daysUntil = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (daysUntil < 0) return 'expired';
  if (daysUntil <= EXPIRING_SOON_DAYS) return 'expiring';
  return 'compliant';
}
