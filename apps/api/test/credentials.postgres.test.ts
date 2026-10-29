import type { NextFunction, Request, Response } from 'express';

jest.mock('../src/config/db', () => ({
  __esModule: true,
  default: new (jest.requireActual('pg').Pool)({
    connectionString: process.env.TEST_DATABASE_URL,
    connectionTimeoutMillis: 3000,
    max: 5,
  }),
  testConnection: jest.fn(),
}));
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { sub: 'synthetic-user', email: '', roles: ['compliance_lead'],
      tenantId: 'synthetic-tenant-a', mfaVerified: true };
    next();
  },
}));
jest.mock('../src/config/s3', () => ({
  s3: { send: jest.fn() },
  PutObjectCommand: jest.requireActual('@aws-sdk/client-s3').PutObjectCommand,
  getSignedDocumentUrl: jest.fn(),
  SIGNED_URL_TTL_SECONDS: 300,
}));

import { Pool } from 'pg';
import request from 'supertest';
import app from '../src/server';
import runtimePool from '../src/config/db';
import { s3, getSignedDocumentUrl } from '../src/config/s3';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const OWNED = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

run('real PostgreSQL ownership, RLS, persistence, and audit gates', () => {
  let admin: Pool;
  let role: string;
  let errors: jest.SpyInstance;

  beforeAll(async () => {
    // Refuse to truncate/modify anything except the runner's disposable DB.
    const url = new URL(process.env.TEST_DATABASE_URL!);
    if (!/^\/matmoud_hardening_test_[a-f0-9]+$/.test(url.pathname) ||
        !/^matmoud_hardening_test_[a-f0-9]+$/.test(url.username)) {
      throw new Error('disposable_test_database_required');
    }
    role = url.username;
    const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
    if (adminUrl.pathname !== url.pathname || adminUrl.hostname !== url.hostname) {
      throw new Error('matching_test_admin_database_required');
    }
    admin = new Pool({ connectionString: adminUrl.toString(), max: 2 });
    const actual = await runtimePool.query(
      `SELECT r.rolsuper, r.rolbypassrls, row_security_active('credentials'::regclass) AS active
       FROM pg_roles r WHERE r.rolname = current_user`
    );
    expect(actual.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, active: true });
  });

  beforeEach(async () => {
    errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    await admin.query(`GRANT INSERT ON audit_events TO "${role}"`);
    await admin.query('TRUNCATE credentials, audit_events RESTART IDENTITY');
    // PHI — synthetic fixtures in a disposable database only.
    await admin.query(
      `INSERT INTO credentials (id,tenant_id,provider_name,license_number,expiration_date)
       VALUES ($1,'synthetic-tenant-a','SYNTHETIC_A','SYNTHETIC_LICENSE_A','2030-01-01'),
              ($2,'synthetic-tenant-b','SYNTHETIC_B','SYNTHETIC_LICENSE_B','2030-01-01')`, [OWNED, OTHER]
    );
    (s3.send as jest.Mock).mockResolvedValue({ ETag: 'synthetic-etag' });
    (getSignedDocumentUrl as jest.Mock).mockResolvedValue('https://documents.example.test/synthetic');
  });

  afterEach(async () => {
    await admin.query(`GRANT INSERT ON audit_events TO "${role}"`);
    await admin.query('DROP TRIGGER IF EXISTS synthetic_commit_failure ON credentials');
    await admin.query('DROP FUNCTION IF EXISTS synthetic_commit_failure()');
    errors?.mockRestore();
  });

  afterAll(async () => {
    await runtimePool.end();
    await admin?.end();
  });

  it('commits an owned upload and retrieves its persisted document', async () => {
    await request(app).post(`/credentials/${OWNED}/upload`)
      .attach('file', PNG, { filename: 'synthetic.png', contentType: 'image/png' }).expect(201);
    const stored = await admin.query('SELECT document_key FROM credentials WHERE id=$1', [OWNED]);
    expect(stored.rows[0].document_key).toMatch(/\.png$/);
    const response = await request(app).get('/credentials').expect(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ id: OWNED, has_document: true });
    expect(response.body[0]).not.toHaveProperty('document_key');
    await request(app).get(`/credentials/${OWNED}/document`).expect(200);
    expect(getSignedDocumentUrl).toHaveBeenCalledWith(stored.rows[0].document_key);
  });

  it('refuses the other tenant before any S3 side effect', async () => {
    await request(app).post(`/credentials/${OTHER}/upload`)
      .attach('file', PNG, { filename: 'synthetic.png', contentType: 'image/png' }).expect(404);
    expect(s3.send).not.toHaveBeenCalled();
    const stored = await admin.query('SELECT document_key FROM credentials WHERE id=$1', [OTHER]);
    expect(stored.rows[0].document_key).toBeNull();
  });

  it('enforces actual RLS even without an application WHERE clause', async () => {
    const client = await runtimePool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant_id',$1,true)`, ['synthetic-tenant-a']);
      expect((await client.query('SELECT id FROM credentials')).rows).toEqual([{ id: OWNED }]);
      await client.query(`SELECT set_config('app.current_tenant_id',$1,true)`, ['synthetic-tenant-b']);
      expect((await client.query('SELECT id FROM credentials')).rows).toEqual([{ id: OTHER }]);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('returns false when the real database has no document', async () => {
    const response = await request(app).get('/credentials').expect(200);
    expect(response.body[0]).toMatchObject({ id: OWNED, has_document: false });
    expect(response.body[0]).not.toHaveProperty('document_key');
  });

  it('blocks a list when the actual audit INSERT permission is revoked', async () => {
    await admin.query(`REVOKE INSERT ON audit_events FROM "${role}"`);
    await request(app).get('/credentials').expect(500, { error: 'internal_error' });
  });

  it('blocks document signing when the actual audit INSERT permission is revoked', async () => {
    await admin.query('UPDATE credentials SET document_key=$1 WHERE id=$2', ['synthetic-key', OWNED]);
    await admin.query(`REVOKE INSERT ON audit_events FROM "${role}"`);
    await request(app).get(`/credentials/${OWNED}/document`).expect(500, { error: 'internal_error' });
    expect(getSignedDocumentUrl).not.toHaveBeenCalled();
  });

  it('does not return upload success if PostgreSQL rejects COMMIT', async () => {
    // A deferred constraint trigger fails at COMMIT, after UPDATE RETURNING succeeds.
    await admin.query(`CREATE FUNCTION synthetic_commit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'SYNTHETIC_COMMIT_ERROR'; END $$;
      CREATE CONSTRAINT TRIGGER synthetic_commit_failure AFTER UPDATE ON credentials
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION synthetic_commit_failure()`);
    await request(app).post(`/credentials/${OWNED}/upload`)
      .attach('file', PNG, { filename: 'synthetic.png', contentType: 'image/png' })
      .expect(500, { error: 'internal_error' });
    const stored = await admin.query('SELECT document_key FROM credentials WHERE id=$1', [OWNED]);
    expect(stored.rows[0].document_key).toBeNull();
  });
});
