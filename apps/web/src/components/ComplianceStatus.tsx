import { Credential, getComplianceStatus } from './types';

const STATUS_META = {
  compliant: { label: 'Compliant', className: 'status-compliant' },
  expiring: { label: 'Expiring Soon', className: 'status-expiring' },
  expired: { label: 'Expired', className: 'status-expired' },
} as const;

export function ComplianceStatusBadge({ expirationDate }: { expirationDate: string }) {
  const status = getComplianceStatus(expirationDate);
  const meta = STATUS_META[status];
  return <span className={`status-badge ${meta.className}`}>{meta.label}</span>;
}

export function ComplianceSummaryStrip({ credentials }: { credentials: Credential[] }) {
  const counts = credentials.reduce(
    (acc, cred) => {
      acc[getComplianceStatus(cred.expiration_date)]++;
      return acc;
    },
    { compliant: 0, expiring: 0, expired: 0 }
  );

  return (
    <div className="compliance-summary-strip">
      <span className="summary-item status-compliant">{counts.compliant} compliant</span>
      <span className="summary-item status-expiring">{counts.expiring} expiring soon</span>
      <span className="summary-item status-expired">{counts.expired} expired</span>
    </div>
  );
}
