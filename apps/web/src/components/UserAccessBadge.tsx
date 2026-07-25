import { useAuth0 } from '@auth0/auth0-react';

// Must match the namespace used by the Auth0 Post-Login Action / backend AUTH0_NAMESPACE.
const AUTH0_NAMESPACE = import.meta.env.VITE_AUTH0_NAMESPACE || 'https://clinical-compliance.com';

const TIER_LABELS: Record<string, { label: string; tier: number }> = {
  customer_support: { label: 'Support', tier: 3 },
  implementation: { label: 'Implementation', tier: 3 },
  viewer: { label: 'Viewer', tier: 3 },
  org_admin: { label: 'Org Admin', tier: 4 },
  clinic_admin: { label: 'Clinic Admin', tier: 4 },
  compliance_lead: { label: 'Compliance Lead', tier: 4 },
  operations_lead: { label: 'Operations Lead', tier: 4 },
  backend_engineer: { label: 'Backend Engineer', tier: 4 },
  db_admin: { label: 'DB Admin', tier: 5 },
  security_devops: { label: 'Security/DevOps', tier: 5 },
};

export function UserAccessBadge() {
  const { user } = useAuth0();

  if (!user) return null;

  const roles = (user[`${AUTH0_NAMESPACE}/roles`] as string[] | undefined) ?? [];
  const highestRole = roles
    .map((r) => TIER_LABELS[r])
    .filter(Boolean)
    .sort((a, b) => b.tier - a.tier)[0];

  if (!highestRole) {
    // No recognized role claim — surface this rather than hide it.
    // The backend will independently reject requests with a 403 either way.
    return (
      <span className="access-badge access-badge-unknown" title="No recognized role claim on this token">
        🚫 Access Denied — no role assigned
      </span>
    );
  }

  return (
    <span className={`access-badge access-badge-tier${highestRole.tier}`}>
      {highestRole.label} · Tier {highestRole.tier}
    </span>
  );
}
