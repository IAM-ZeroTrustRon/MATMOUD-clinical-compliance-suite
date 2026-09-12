/**
 * Regression tests for MFA enforcement in authMiddleware.
 *
 * Why these exist (audit finding MOUD-01):
 *   The `amr` allow-list previously read
 *     ['pwd', 'totp', 'otp', 'fido', 'fido2', 'mfa']
 *   'pwd' is Auth0's value for a plain password-only login, so the MFA check
 *   passed for every authenticated session — the control was inert while
 *   reading as correct in code review, and while the file's own comments and
 *   error message claimed MFA was enforced.
 *
 *   The first test below is the one that would have caught it.
 *
 * These tests exercise the allow-list only. JWT signature verification and
 * JWKS retrieval are mocked out — those are Auth0's responsibility, not the
 * behavior under test here.
 */

const NAMESPACE = 'https://test.example.com';

// Must be set before the module under test is imported — it throws on load
// if any of these are missing.
process.env.AUTH0_DOMAIN = 'test.auth0.com';
process.env.AUTH0_AUDIENCE = 'https://api.test';
process.env.AUTH0_NAMESPACE = NAMESPACE;

let mockPayload: Record<string, unknown> = {};

jest.mock('jwks-rsa', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    getSigningKey: (
      _kid: string,
      cb: (err: Error | null, key: { getPublicKey: () => string }) => void
    ) => cb(null, { getPublicKey: () => 'test-public-key' }),
  })),
}));

jest.mock('jsonwebtoken', () => ({
  __esModule: true,
  default: {
    verify: (
      _token: string,
      _getKey: unknown,
      _opts: unknown,
      cb: (err: Error | null, decoded?: unknown) => void
    ) => cb(null, mockPayload),
  },
}));

import type { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth.middleware';

type TestRes = Response & { statusCode?: number; body?: Record<string, unknown> };
type UserReq = Request & { user?: { mfaVerified: boolean; roles: string[]; tenantId: string } };

function buildRes(): TestRes {
  const res = {} as TestRes;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as TestRes['status'];
  res.json = jest.fn((body: Record<string, unknown>) => {
    res.body = body;
    return res;
  }) as unknown as TestRes['json'];
  return res;
}

/** Runs authMiddleware against a token whose amr claim is `amr`. */
function run(amr?: string[]) {
  mockPayload = {
    sub: 'auth0|test-user',
    email: 'test@example.com',
    [`${NAMESPACE}/roles`]: ['compliance_lead'],
    [`${NAMESPACE}/tenant_id`]: 'tenant-a',
    ...(amr ? { [`${NAMESPACE}/amr`]: amr } : {}),
  };

  const req = { headers: { authorization: 'Bearer fake.jwt.token' } } as UserReq;
  const res = buildRes();
  const next = jest.fn() as unknown as NextFunction;

  authMiddleware(req, res, next);
  return { req, res, next: next as unknown as jest.Mock };
}

describe('authMiddleware — MFA enforcement (regression: MOUD-01)', () => {
  it('rejects a password-only login (amr: ["pwd"])', () => {
    const { res, next } = run(['pwd']);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects the ambiguous "otp" value (amr: ["otp"])', () => {
    const { res, next } = run(['otp']);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token with no amr claim at all', () => {
    const { res, next } = run(undefined);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects an empty amr claim (amr: [])', () => {
    const { res, next } = run([]);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it.each(['mfa', 'totp', 'fido', 'fido2'])(
    'accepts a genuine second factor (amr: ["%s"])',
    (method) => {
      const { req, next } = run([method]);
      expect(next).toHaveBeenCalled();
      expect(req.user?.mfaVerified).toBe(true);
    }
  );

  it('accepts when a real factor accompanies pwd (amr: ["pwd","totp"])', () => {
    const { next } = run(['pwd', 'totp']);
    expect(next).toHaveBeenCalled();
  });
});

describe('authMiddleware — fail-closed claim validation', () => {
  it('rejects a missing Authorization header with 401', () => {
    const req = { headers: {} } as UserReq;
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token with no roles claim with 403', () => {
    mockPayload = {
      sub: 'auth0|test-user',
      [`${NAMESPACE}/tenant_id`]: 'tenant-a',
      [`${NAMESPACE}/amr`]: ['totp'],
    };
    const req = { headers: { authorization: 'Bearer fake.jwt.token' } } as UserReq;
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('rejects a token with no tenant_id claim with 403', () => {
    mockPayload = {
      sub: 'auth0|test-user',
      [`${NAMESPACE}/roles`]: ['compliance_lead'],
      [`${NAMESPACE}/amr`]: ['totp'],
    };
    const req = { headers: { authorization: 'Bearer fake.jwt.token' } } as UserReq;
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
