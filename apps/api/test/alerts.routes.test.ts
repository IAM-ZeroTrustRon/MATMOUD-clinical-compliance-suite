import type { NextFunction, Request, Response } from 'express';

jest.mock('../src/config/db', () => ({
  __esModule: true, default: { connect: jest.fn(), query: jest.fn() }, testConnection: jest.fn(),
}));
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { sub: 'synthetic-user', email: '', mfaVerified: true,
      roles: [req.headers['x-test-role'] === 'viewer' ? 'viewer' : 'compliance_lead'],
      tenantId: 'synthetic-tenant' };
    next();
  },
}));
jest.mock('../src/services/expiration.service', () => ({
  getExpiringCredentials: jest.fn(), markAlertSent: jest.fn(),
}));
jest.mock('../src/services/email.service', () => ({ sendExpirationAlert: jest.fn() }));

import request from 'supertest';
import app from '../src/server';
import pool from '../src/config/db';
import { getExpiringCredentials, markAlertSent } from '../src/services/expiration.service';
import { sendExpirationAlert } from '../src/services/email.service';

const ID = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const SENTINEL = 'SYNTHETIC_PRIVATE_ERROR'; // PHI sentinel, no real records
const send = sendExpirationAlert as jest.Mock;
const mark = markAlertSent as jest.Mock;
const read = getExpiringCredentials as jest.Mock;
const audit = pool.query as jest.Mock;
let errorLog: jest.SpyInstance;

beforeEach(() => {
  jest.resetAllMocks();
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  (pool.connect as jest.Mock).mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn(),
  });
  read.mockResolvedValue([{ id: ID, provider_name: 'SYNTHETIC_PROVIDER', expiration_date: '2030-01-01' }]); // PHI synthetic fixture
  send.mockResolvedValue(undefined);
  mark.mockResolvedValue(undefined);
  audit.mockResolvedValue({ rows: [] });
});
afterEach(() => errorLog.mockRestore());
const run = () => request(app).post('/alerts/run').send({ days: 30 });

it('reports delivery and audit success separately with no-store', async () => {
  const response = await run().expect(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body).toMatchObject({ status: 'completed', total: 1, sent: 1, failed: 0,
    auditFailed: 0, trackingFailed: 0,
    results: [{ credentialId: ID, success: true, emailed: true, audited: true }] });
  expect(mark).toHaveBeenCalledWith(expect.anything(), ID);
});

it('reports delivered-but-unaudited messages without swallowing the failure', async () => {
  audit.mockImplementation(async (_sql: string, params: unknown[]) => {
    if (params[2] === 'GET:alert_sent') throw new Error(SENTINEL);
    return { rows: [] };
  });
  const response = await run().expect(200);
  expect(response.body).toMatchObject({ status: 'completed_with_errors', sent: 1, failed: 0,
    auditFailed: 1, results: [{ credentialId: ID, success: false, emailed: true,
      audited: false, error: 'alert_audit_failed' }] });
  expect(mark).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(response.body)).not.toContain(SENTINEL);
  expect(JSON.stringify(errorLog.mock.calls)).not.toContain(SENTINEL);
});

it('does not audit or mark an undelivered message', async () => {
  send.mockRejectedValue(new Error(SENTINEL));
  const response = await run().expect(200);
  expect(response.body).toMatchObject({ sent: 0, failed: 1, auditFailed: 0,
    results: [{ success: false, emailed: false, audited: false, error: 'alert_send_failed' }] });
  expect(mark).not.toHaveBeenCalled();
  expect(audit.mock.calls.some(([, params]) => params[2] === 'GET:alert_sent')).toBe(false);
  expect(JSON.stringify(response.body)).not.toContain(SENTINEL);
});

it('preserves delivery and audit facts when deduplication tracking fails', async () => {
  mark.mockRejectedValue(new Error(SENTINEL));
  const response = await run().expect(200);
  expect(response.body).toMatchObject({ sent: 1, failed: 0, auditFailed: 0, trackingFailed: 1,
    results: [{ success: false, emailed: true, audited: true, error: 'alert_tracking_failed' }] });
  expect(JSON.stringify(response.body)).not.toContain(SENTINEL);
});

it('counts mixed delivery outcomes without treating a sent message as unsent', async () => {
  read.mockResolvedValue([{ id: ID, expiration_date: '2030-01-01' },
    { id: OTHER, expiration_date: '2030-01-01' }]);
  send.mockRejectedValueOnce(new Error(SENTINEL));
  const response = await run().expect(200);
  expect(response.body).toMatchObject({ total: 2, sent: 1, failed: 1, auditFailed: 0 });
});

it('denies a viewer before querying credentials or sending email', async () => {
  await request(app).post('/alerts/run').set('x-test-role', 'viewer').send({ days: 30 }).expect(403);
  expect(read).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it('does not expose database errors when candidate lookup fails', async () => {
  read.mockRejectedValue(new Error(SENTINEL));
  const response = await run().expect(500);
  expect(JSON.stringify(response.body)).not.toContain(SENTINEL);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(send).not.toHaveBeenCalled();
});
