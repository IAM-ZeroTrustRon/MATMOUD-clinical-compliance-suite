import { Request, Response, NextFunction } from 'express';

/**
 * Canonical role names — must match the values set in your Auth0 custom claims.
 */
export const ROLES = {
  // Tier 3 — Limited Support: PHI is masked by default
  CUSTOMER_SUPPORT: 'customer_support',
  IMPLEMENTATION:   'implementation',
  VIEWER:           'viewer',

  // Tier 4 — Clinical / Backend: full access within assigned tenant scope
  ORG_ADMIN:        'org_admin',
  CLINIC_ADMIN:     'clinic_admin',
  COMPLIANCE_LEAD:  'compliance_lead',
  OPERATIONS_LEAD:  'operations_lead',
  BACKEND_ENGINEER: 'backend_engineer',

  // Tier 5 — Privileged Admin: full system access; requires dual approval out-of-band
  DB_ADMIN:         'db_admin',
  SECURITY_DEVOPS:  'security_devops',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const TIER = {
  LIMITED_SUPPORT:  3,
  CLINICAL_BACKEND: 4,
  PRIVILEGED_ADMIN: 5,
} as const;

export type AccessTier = (typeof TIER)[keyof typeof TIER];

const ROLE_TO_TIER: Record<Role, AccessTier> = {
  [ROLES.CUSTOMER_SUPPORT]: TIER.LIMITED_SUPPORT,
  [ROLES.IMPLEMENTATION]:   TIER.LIMITED_SUPPORT,
  [ROLES.VIEWER]:           TIER.LIMITED_SUPPORT,
  [ROLES.ORG_ADMIN]:        TIER.CLINICAL_BACKEND,
  [ROLES.CLINIC_ADMIN]:     TIER.CLINICAL_BACKEND,
  [ROLES.COMPLIANCE_LEAD]:  TIER.CLINICAL_BACKEND,
  [ROLES.OPERATIONS_LEAD]:  TIER.CLINICAL_BACKEND,
  [ROLES.BACKEND_ENGINEER]: TIER.CLINICAL_BACKEND,
  [ROLES.DB_ADMIN]:         TIER.PRIVILEGED_ADMIN,
  [ROLES.SECURITY_DEVOPS]:  TIER.PRIVILEGED_ADMIN,
};

/** Returns the highest access tier the request's user holds. */
function resolveUserTier(req: Request): AccessTier | 0 {
  const userRoles = (req.user?.roles ?? []) as Role[];
  return (Math.max(0, ...userRoles.map((r) => ROLE_TO_TIER[r] ?? 0)) as AccessTier | 0);
}

/**
 * requireRole — gate a route to specific roles (exact match).
 *
 * Usage:
 *   router.get('/credentials', requireRole(ROLES.COMPLIANCE_LEAD, ROLES.ORG_ADMIN), handler);
 */
export function requireRole(...allowedRoles: Role[]) {
  return function (req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userRoles = req.user.roles as Role[];
    const hasRole = allowedRoles.some((r) => userRoles.includes(r));

    if (!hasRole) {
      res.status(403).json({ error: 'Forbidden: insufficient role' });
      return;
    }

    next();
  };
}

/**
 * requireMinTier — gate a route to a minimum access tier.
 *
 * Usage:
 *   router.delete('/org/:id', requireMinTier(TIER.PRIVILEGED_ADMIN), handler);
 */
export function requireMinTier(minTier: AccessTier) {
  return function (req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (resolveUserTier(req) < minTier) {
      res.status(403).json({ error: 'Forbidden: insufficient access tier' });
      return;
    }

    next();
  };
}

/**
 * maskPhiFields — apply before returning data to Tier 3 users.
 *
 * PHI NOTE: fields listed in phiFields are PHI and must be masked for
 * any user below TIER.CLINICAL_BACKEND per the Minimum Necessary Standard.
 *
 * Usage:
 *   const safe = maskPhiFields(req, credentialRecord, ['ssn', 'dob', 'license_number']); // PHI
 */
export function maskPhiFields<T extends Record<string, unknown>>(
  req: Request,
  data: T,
  phiFields: (keyof T)[] // PHI
): T {
  if (resolveUserTier(req) >= TIER.CLINICAL_BACKEND) {
    return data;
  }

  const masked = { ...data };
  for (const field of phiFields) {
    masked[field] = '[RESTRICTED]' as T[typeof field];
  }
  return masked;
}
