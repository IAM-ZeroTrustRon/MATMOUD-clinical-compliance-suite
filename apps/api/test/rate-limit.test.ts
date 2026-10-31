/**
 * Rate-limit regression tests (audit debt: no request throttling).
 *
 * Why a separate file: the limiter reads its ceiling at module load, so these
 * cases need a deliberately tiny budget. Jest gives each test file its own
 * module registry, which means this file can lower the limit without touching
 * the limits other suites run under.
 *
 * The assertions are written to fail against the previous server.ts, which had
 * no limiter at all: without it every request below returns a 4xx/2xx from the
 * route rather than 429.
 */

process.env.RATE_LIMIT_MAX = '3';
process.env.RATE_LIMIT_SENSITIVE_MAX = '2';

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

// The limiter sits in front of the router, so the route's own auth chain is not
// under test here; deny every request so the status tells us which layer
// answered (401 = route, 429 = limiter).
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    res.status(401).json({ error: 'unauthorized' });
  },
}));

import request from 'supertest';
import app from '../src/server';

describe('rate limiting', () => {
  it('throttles a feature route once the configured budget is spent', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app).get('/credentials');
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses[3]).toBe(429);
  });

  it('returns a stable error body rather than an HTML default page', async () => {
    for (let i = 0; i < 2; i += 1) {
      await request(app).get('/audit-logs');
    }
    const blocked = await request(app).get('/audit-logs');

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'rate_limited' });
  });

  it('applies a tighter budget to the outbound-effect route', async () => {
    const first = await request(app).post('/alerts/run');
    const second = await request(app).post('/alerts/run');
    const third = await request(app).post('/alerts/run');

    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(third.status).toBe(429);
  });

  it('leaves health probes outside the limiter', async () => {
    for (let i = 0; i < 6; i += 1) {
      const res = await request(app).get('/health');
      expect(res.status).not.toBe(429);
    }
  });
});
