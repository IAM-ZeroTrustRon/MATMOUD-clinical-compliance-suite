import type { NextFunction, Request, Response } from 'express';

// Exercise real HTTP routes, RBAC, tenant lifecycle, audit helper, and errors.
// External identity, PostgreSQL transport, and S3 are deterministic doubles.
jest.mock('../src/config/db', () => ({
  __esModule: true,
  default: { connect: jest.fn(), query: jest.fn() },
  testConnection: jest.fn(),
}));
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer synthetic-test-session') {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    req.user = {
      sub: 'synthetic-user', email: '', mfaVerified: true,
      roles: [req.headers['x-test-role'] === 'viewer' ? 'viewer' : 'compliance_lead'],
      tenantId: 'synthetic-tenant-a',
    };
    next();
  },
}));
jest.mock('../src/config/s3', () => ({
  s3: { send: jest.fn() },
  PutObjectCommand: jest.requireActual('@aws-sdk/client-s3').PutObjectCommand,
  getSignedDocumentUrl: jest.fn(),
  SIGNED_URL_TTL_SECONDS: 300,
}));

import request from 'supertest';
import app from '../src/server';
import pool from '../src/config/db';
import { s3, getSignedDocumentUrl } from '../src/config/s3';

const OWNED = '00000000-0000-4000-8000-000000000001';
const WITH_DOCUMENT = '00000000-0000-4000-8000-000000000002';
const OTHER_TENANT = '00000000-0000-4000-8000-000000000003';
const UNKNOWN = '00000000-0000-4000-8000-000000000004';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const SENTINEL = 'SYNTHETIC_SENSITIVE_ERROR_SENTINEL'; // PHI test sentinel only
const mockConnect = pool.connect as jest.Mock;
const mockPoolQuery = pool.query as jest.Mock;
const mockSend = s3.send as jest.Mock;
const mockSign = getSignedDocumentUrl as jest.Mock;

let store: Map<string, { tenant: string; key: string | null }>;
let pending: typeof store | undefined;
let activeTenant: string | undefined;
let failCommit: boolean;
let failUpdate: boolean;
let failRead: boolean;
let failHealth: boolean;
let query: jest.Mock;
let release: jest.Mock;
let errorLog: jest.SpyInstance;

const authed = (r: request.Test) => r.set('Authorization', 'Bearer synthetic-test-session');
const upload = (id = OWNED) => authed(request(app).post(`/credentials/${id}/upload`))
  .attach('file', PNG, { filename: 'synthetic-private-name.png', contentType: 'image/png' });

beforeEach(() => {
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  store = new Map([
    [OWNED, { tenant: 'synthetic-tenant-a', key: null }],
    [WITH_DOCUMENT, { tenant: 'synthetic-tenant-a', key: 'synthetic-internal-key' }],
    [OTHER_TENANT, { tenant: 'synthetic-tenant-b', key: 'synthetic-other-key' }],
  ]);
  pending = undefined;
  activeTenant = undefined;
  failCommit = failUpdate = failRead = failHealth = false;
  release = jest.fn();
  query = jest.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized === 'BEGIN') {
      pending = new Map([...store].map(([id, row]) => [id, { ...row }]));
      return { rows: [] };
    }
    if (normalized.includes('set_config')) {
      activeTenant = params[1] as string;
      return { rows: [] };
    }
    if (normalized === 'COMMIT') {
      if (failCommit) throw new Error(SENTINEL);
      if (pending) store = pending;
      pending = undefined;
      activeTenant = undefined;
      return { rows: [] };
    }
    if (normalized === 'ROLLBACK') {
      pending = undefined;
      activeTenant = undefined;
      return { rows: [] };
    }
    if (normalized === 'SELECT 1') {
      if (failHealth) throw new Error(SENTINEL);
      return { rows: [{ value: 1 }] };
    }
    const rows = pending ?? store;
    const owned = (id: string) => rows.get(id)?.tenant === activeTenant;
    if (normalized.startsWith('SELECT id FROM credentials')) {
      return { rows: owned(params[0] as string) ? [{ id: params[0] }] : [] };
    }
    if (normalized.startsWith('UPDATE credentials SET document_key')) {
      if (failUpdate || !owned(params[1] as string)) return { rows: [], rowCount: 0 };
      rows.get(params[1] as string)!.key = params[0] as string;
      return { rows: [{ id: params[1] }], rowCount: 1 };
    }
    if (normalized.startsWith('SELECT document_key')) {
      return { rows: owned(params[0] as string) ? [{ document_key: rows.get(params[0] as string)!.key }] : [] };
    }
    if (normalized.startsWith('SELECT id, provider_name')) {
      if (failRead) throw new Error(SENTINEL);
      // PHI — entirely generated fixtures. Inject extra columns to test projection.
      return { rows: [...rows].filter(([, row]) => row.tenant === activeTenant).map(([id, row]) => ({
        id, provider_name: 'SYNTHETIC_PROVIDER', ssn: 'SYNTHETIC_SSN', dob: '1900-01-01',
        license_number: 'SYNTHETIC_LICENSE', expiration_date: '2030-01-01',
        has_document: !!row.key, document_key: row.key, unexpected_field: SENTINEL,
        created_at: '2026-01-01T00:00:00Z',
      })) };
    }
    throw new Error('unexpected_test_query');
  });
  mockConnect.mockResolvedValue({ query, release });
  mockPoolQuery.mockImplementation(async (sql: string) => {
    if (!sql.includes('INSERT INTO audit_events')) throw new Error('shared_pool_data_query_forbidden');
    return { rows: [] };
  });
  mockSend.mockResolvedValue({ ETag: 'synthetic-etag' });
  mockSign.mockResolvedValue('https://documents.example.test/synthetic-url');
});

afterEach(() => errorLog.mockRestore());

describe('tenant-scoped multipart uploads', () => {
  it('checks ownership before S3, commits the key, and permits subsequent retrieval', async () => {
    mockSend.mockImplementation(async () => {
      expect(query.mock.calls.some(([sql]) => sql.includes('FOR UPDATE'))).toBe(true);
      return { ETag: 'synthetic-etag' };
    });
    const result = await upload().expect(201);
    expect(result.body).toEqual({ status: 'uploaded', etag: 'synthetic-etag', has_document: true });
    const key = store.get(OWNED)!.key;
    expect(key).toMatch(new RegExp(`^tenant/synthetic-tenant-a/cred/${OWNED}/[0-9a-f-]+\\.png$`));
    expect(key).not.toContain('synthetic-private-name');
    expect(query.mock.calls.filter(([sql]) => sql === 'COMMIT')).toHaveLength(1);
    expect(release).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.input).toMatchObject({ Key: key, ServerSideEncryption: 'aws:kms' });
    expect(mockPoolQuery.mock.calls.every(([sql]) => sql.includes('INSERT INTO audit_events'))).toBe(true);
    await authed(request(app).get(`/credentials/${OWNED}/document`)).expect(200);
    expect(mockSign).toHaveBeenCalledWith(key);
  });

  it.each([OTHER_TENANT, UNKNOWN])('rejects an unowned/missing ID before S3: %s', async (id) => {
    await upload(id).expect(404, { error: 'credential_not_found' });
    expect(mockSend).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE credentials'))).toBe(false);
  });

  it('rejects Tier 3 before S3', async () => {
    await authed(request(app).post(`/credentials/${OWNED}/upload`)).set('x-test-role', 'viewer')
      .attach('file', PNG, 'synthetic.png').expect(403);
    expect(mockSend).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
  });

  it('rejects a missing session before connecting', async () => {
    await request(app).post(`/credentials/${OWNED}/upload`).expect(401);
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it.each(['update', 'commit'])('does not claim persistence after %s failure', async (stage) => {
    failUpdate = stage === 'update';
    failCommit = stage === 'commit';
    await upload().expect(500, { error: 'internal_error' });
    expect(store.get(OWNED)!.key).toBeNull();
    expect(query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(SENTINEL);
  });

  it('sanitizes a failed S3 response and rolls back', async () => {
    mockSend.mockRejectedValue(new Error(SENTINEL));
    await upload().expect(500, { error: 'internal_error' });
    expect(store.get(OWNED)!.key).toBeNull();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(SENTINEL);
  });

  it('rejects an oversized multipart file before S3', async () => {
    await authed(request(app).post(`/credentials/${OWNED}/upload`))
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), { filename: 'synthetic.png', contentType: 'image/png' })
      .expect(413, { error: 'file_too_large' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('rejects a MIME mismatch before S3', async () => {
    await authed(request(app).post(`/credentials/${OWNED}/upload`))
      .attach('file', PNG, { filename: 'synthetic.pdf', contentType: 'application/pdf' }).expect(400);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('credential response contract and read audit gates', () => {
  it('returns document presence without keys or unapproved fields', async () => {
    const response = await authed(request(app).get('/credentials')).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.map((row: { has_document: boolean }) => row.has_document)).toEqual([false, true]);
    for (const row of response.body) {
      expect(row).not.toHaveProperty('document_key');
      expect(row).not.toHaveProperty('unexpected_field');
    }
    expect(response.text).not.toContain('synthetic-internal-key');
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    expect(mockPoolQuery.mock.calls[0][1]).toContain('GET:credential');
  });

  it('masks PHI for Tier 3 without changing the boolean contract', async () => {
    const response = await authed(request(app).get('/credentials')).set('x-test-role', 'viewer').expect(200);
    for (const row of response.body) {
      for (const field of ['provider_name', 'ssn', 'dob', 'license_number']) expect(row[field]).toBe('[RESTRICTED]');
      expect(typeof row.has_document).toBe('boolean');
      expect(row).not.toHaveProperty('document_key');
    }
  });

  it.each([1, 2])('fails the entire list if audit write %s fails', async (number) => {
    let seen = 0;
    mockPoolQuery.mockImplementation(async () => {
      if (++seen === number) throw new Error(SENTINEL);
      return { rows: [] };
    });
    const response = await authed(request(app).get('/credentials')).expect(500, { error: 'internal_error' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).not.toContain('SYNTHETIC_PROVIDER');
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(SENTINEL);
  });

  it('does not sign a document when its audit write fails', async () => {
    mockPoolQuery.mockRejectedValue(new Error(SENTINEL));
    await authed(request(app).get(`/credentials/${WITH_DOCUMENT}/document`)).expect(500, { error: 'internal_error' });
    expect(mockSign).not.toHaveBeenCalled();
  });

  it.each([OTHER_TENANT, UNKNOWN])('does not sign an unowned/missing document: %s', async (id) => {
    await authed(request(app).get(`/credentials/${id}/document`)).expect(404);
    expect(mockSign).not.toHaveBeenCalled();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('does not sign a credential with no document', async () => {
    await authed(request(app).get(`/credentials/${OWNED}/document`)).expect(404);
    expect(mockSign).not.toHaveBeenCalled();
  });
});

describe('safe errors and cache policy', () => {
  it.each(['production', 'development'])('redacts driver failures in %s', async (environment) => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = environment;
    try {
      failRead = true;
      const response = await authed(request(app).get('/credentials')).expect(500, { error: 'internal_error' });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(SENTINEL);
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('returns a degraded health result without details and releases the connection', async () => {
    failHealth = true;
    const response = await request(app).get('/health').expect(503);
    expect(response.body).not.toHaveProperty('detail');
    expect(response.text).not.toContain(SENTINEL);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('sanitizes JSON parser errors before route middleware', async () => {
    const response = await request(app).post('/credentials').set('Content-Type', 'application/json')
      .send(`{"value":"${SENTINEL}"`).expect(400, { error: 'invalid_json' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404])('sets no-store on denied/missing responses: %s', async (status) => {
    let call = request(app).get(`/credentials/${UNKNOWN}/document`);
    if (status !== 401) call = authed(call);
    if (status === 403) call = call.set('x-test-role', 'viewer');
    const response = await call.expect(status);
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
