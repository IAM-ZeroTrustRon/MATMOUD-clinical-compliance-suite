// Creates/drops only uniquely named synthetic fixtures, never the app database.
const { Client } = require('pg');
const { randomBytes } = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });

async function run() {
  const source = process.env.TEST_ADMIN_DATABASE_URL ||
    (process.argv.includes('--local') ? process.env.DATABASE_URL : undefined);
  if (!source) throw new Error('test_admin_configuration_required');
  const url = new URL(source);
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)) {
    throw new Error('local_test_server_required');
  }
  const name = 'matmoud_hardening_test_' + randomBytes(8).toString('hex');
  if (!/^matmoud_hardening_test_[a-f0-9]+$/.test(name)) throw new Error('invalid_fixture_name');
  const password = randomBytes(24).toString('hex');
  const admin = new Client({ connectionString: source, connectionTimeoutMillis: 5000 });
  let roleCreated = false;
  let databaseCreated = false;
  let fixture;
  try {
    await admin.connect();
    await admin.query(`CREATE ROLE "${name}" LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`);
    roleCreated = true;
    await admin.query(`CREATE DATABASE "${name}"`);
    databaseCreated = true;
    const fixtureAdmin = new URL(source);
    fixtureAdmin.pathname = '/' + name;
    fixture = new Client({ connectionString: fixtureAdmin.toString(), connectionTimeoutMillis: 5000 });
    await fixture.connect();
    for (const file of ['init-audit-table.sql', 'init-credentials-table.sql']) {
      const sql = fs.readFileSync(path.join(root, 'src/config', file), 'utf8')
        .replace(/\bmatmoud_writer\b/g, `"${name}"`);
      await fixture.query(sql);
    }
    await fixture.end();
    fixture = undefined;
    const runtime = new URL(fixtureAdmin);
    runtime.username = name;
    runtime.password = password;
    fs.mkdirSync(path.join(root, 'coverage'), { recursive: true });
    const child = spawnSync(process.execPath, [
      path.join(root, 'node_modules/jest/bin/jest.js'), '--runInBand', '--runTestsByPath',
      'test/credentials.postgres.test.ts', '--json', '--outputFile=coverage/hardening-postgres-results.json',
    ], { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test',
      DATABASE_URL: runtime.toString(), TEST_DATABASE_URL: runtime.toString(),
      TEST_DATABASE_ADMIN_URL: fixtureAdmin.toString() } });
    process.exitCode = child.status === 0 ? 0 : 1;
  } finally {
    let cleanupFailed = false;
    if (fixture) await fixture.end().catch(() => { cleanupFailed = true; });
    if (databaseCreated) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
      .catch(() => { cleanupFailed = true; });
    if (roleCreated) await admin.query(`DROP ROLE "${name}"`)
      .catch(() => { cleanupFailed = true; });
    await admin.end().catch(() => { cleanupFailed = true; });
    if (cleanupFailed) throw new Error('disposable_fixture_cleanup_failed');
    console.log('[TEST-DATABASE] Disposable fixture cleanup completed');
  }
}

run().catch(() => {
  // Never print connection strings, database errors, or generated credentials.
  console.error('[TEST-DATABASE] Run failed; verify local test-server configuration/privileges');
  process.exitCode = 1;
});
