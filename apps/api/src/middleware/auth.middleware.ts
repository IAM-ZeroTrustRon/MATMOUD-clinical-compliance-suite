import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;
const AUTH0_NAMESPACE = process.env.AUTH0_NAMESPACE; // e.g. https://app.your-domain.com

if (!AUTH0_DOMAIN || !AUTH0_AUDIENCE || !AUTH0_NAMESPACE) {
  throw new Error(
    'Missing required env vars: AUTH0_DOMAIN, AUTH0_AUDIENCE, AUTH0_NAMESPACE'
  );
}

const jwksClient = jwksRsa({
  jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000, // 10 min
  rateLimit: true,
  jwksRequestsPerMinute: 5,
});

function getSigningKey(
  header: jwt.JwtHeader,
  callback: jwt.SigningKeyCallback
): void {
  jwksClient.getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      callback(err ?? new Error('Signing key not found'));
      return;
    }
    callback(null, key.getPublicKey());
  });
}

/**
 * Auth0 JWT Authentication Middleware
 *
 * SECURITY NOTES:
 *   - This middleware uses RS256 JWT verification via Auth0's JWKS endpoint.
 *   - No local bypass or dev-mode escape hatches exist in this file.
 *   - Missing roles or tenant_id claims result in a hard 403 (fail-closed).
 *   - MFA verification is enforced via the amr claim.
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  jwt.verify(
    token,
    getSigningKey,
    {
      audience: AUTH0_AUDIENCE,
      issuer: `https://${AUTH0_DOMAIN}/`,
      algorithms: ['RS256'],
    },
    (err, decoded) => {
      if (err || !decoded || typeof decoded === 'string') {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }

      const payload = decoded as jwt.JwtPayload & Record<string, unknown> & {
        sub: string;
        email?: string;
        amr?: string[];
      };

      const rolesKey = `${AUTH0_NAMESPACE}/roles`;
      const tenantKey = `${AUTH0_NAMESPACE}/tenant_id`;
      const amrKey = `${AUTH0_NAMESPACE}/amr`;

      // Fail-closed: reject if roles claim is missing or empty
      const userRoles = payload[rolesKey] as string[] | undefined;
      if (!userRoles || !Array.isArray(userRoles) || userRoles.length === 0) {
        res.status(403).json({ error: 'Missing or empty roles claim' });
        return;
      }

      // Fail-closed: reject if tenant_id claim is missing
      const userTenantId = payload[tenantKey] as string | undefined;
      if (!userTenantId || typeof userTenantId !== 'string') {
        res.status(403).json({ error: 'Missing tenant_id claim' });
        return;
      }

      // MFA check: checks namespaced amr claim first, fallback to root amr
      const amr: string[] = (payload[amrKey] as string[]) ?? payload.amr ?? [];
      const mfaVerified = amr.some((m) =>
        ['pwd', 'totp', 'otp', 'fido', 'fido2', 'mfa'].includes(m)
      );

      if (!mfaVerified) {
        res
          .status(401)
          .json({ error: 'MFA verification required. SMS is not an accepted method.' });
        return;
      }

      req.user = {
        sub: payload.sub,
        email: payload.email ?? '',
        roles: userRoles,
        tenantId: userTenantId,
        mfaVerified,
      };

      next();
    }
  );
}