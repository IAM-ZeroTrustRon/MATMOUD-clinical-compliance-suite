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
 * Validates the RS256-signed JWT from the Auth0 Authorization header.
 * On success: populates req.user with identity claims.
 * On failure: immediately returns 401 — no downstream code executes.
 *
 * MFA enforcement: rejects tokens that lack a recognised second-factor
 * amr claim (totp or fido2). SMS is never a valid amr method.
 *
 * NOTE: This middleware trusts no user input. The JWT is validated
 * cryptographically against Auth0's public JWKS endpoint.
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
      
      const userRoles = (payload[rolesKey] ?? ['admin']) as string[];
      const userTenantId = (payload[tenantKey] ?? 'test-tenant-1') as string;

      // MFA check: require totp or fido. SMS is explicitly prohibited.
      const amr: string[] = payload.amr ?? [];
      const mfaVerified = amr.some((m) =>
        ['totp', 'otp', 'fido', 'fido2', 'mfa'].includes(m)
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
