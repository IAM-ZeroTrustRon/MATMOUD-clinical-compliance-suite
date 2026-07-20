/**
 * Middleware chain for apps/api
 *
 * Apply in this exact order on every protected route:
 *
 *   app.use(authMiddleware);                          // 1. Verify Auth0 JWT + MFA
 *   app.use(createTenantMiddleware(db));              // 2. Set PostgreSQL RLS context
 *   app.use(createAuditMiddleware(db));               // 3. Log mutating requests
 *
 * Then apply RBAC guards per-route:
 *   router.get('/credentials', requireRole(ROLES.COMPLIANCE_LEAD), handler);
 *   router.delete('/org/:id',  requireMinTier(TIER.PRIVILEGED_ADMIN), handler);
 */
export { authMiddleware } from './auth.middleware';
export { createTenantMiddleware } from './tenant.middleware';
export { createAuditMiddleware, auditPhiRead } from './audit.middleware';
export { requireRole, requireMinTier, maskPhiFields, ROLES, TIER } from './rbac';
export type { Role, AccessTier } from './rbac';
