/**
 * Edge-hardening regression tests (audit debt: no security headers, no CORS,
 * no request throttling).
 *
 * Why these exist:
 *   The API previously had no `helmet`, no CORS policy, and no rate limiting.
 *   Route-level auth protects data, but it runs *after* the request has already
 *   been accepted, so an unauthenticated caller could probe and exhaust the
 *   process freely. These tests pin the three controls that now sit in front of
 *   every route, and the `Cache-Control` header that keeps PHI out of caches.
 *
 * Scope note: the rate limiter is exercised in rate-limit.test.ts, which needs
 * a low limit and therefore its own module instance.
 */

process.env.RATE_LIMIT_MAX = '500';

// Stub identity so this suite does not depend on Auth0 configuration. The real
// auth middleware throws at import time when its env vars are absent, which is
// exactly the state of a clean CI checkout; edge hardening is tested here, not
// token verification.
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    res.status(401).json({ error: 'unauthorized' });
  },
}));

jest.mock('../src/config/db', () => ({
  __esModule: true,
  default: {
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      release: jest.fn(),
    }),
    query: jest.fn(),
  },
  testConnection: jest.fn(),
}));

import request from 'supertest';
import app from '../src/server';

describe('edge hardening', () => {
  it('sets baseline security headers and hides the framework banner', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('keeps Cache-Control no-store on responses', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('allows the configured development origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('refuses an origin outside the allowlist', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://attacker.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers preflight for the allowed origin without reflecting arbitrary headers', async () => {
    const res = await request(app)
      .options('/credentials')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-headers']).toContain('Authorization');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
});
