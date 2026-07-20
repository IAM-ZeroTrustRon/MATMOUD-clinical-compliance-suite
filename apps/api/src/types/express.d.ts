import { PoolClient } from 'pg';

declare global {
  namespace Express {
    interface Request {
      /**
       * Populated by auth.middleware.ts after JWT validation.
       * Contains no PHI — only identity and role claims from Auth0.
       */
      user?: {
        sub: string;        // Auth0 subject ID (opaque, not PHI)
        email: string;      // Operator email — not patient PHI
        roles: string[];
        tenantId: string;
        mfaVerified: boolean;
      };

      /** Populated by tenant.middleware.ts after RLS context is set. */
      tenantId?: string;

      /**
       * A dedicated Pool connection with RLS context already applied.
       * Set by tenant.middleware.ts. Route handlers MUST use this connection
       * to ensure all queries are scoped to the correct tenant.
       */
      dbClient?: PoolClient;
    }
  }
}
