// Publishes allowlisted aggregates/hashes only; raw runner/device output stays ignored.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '../../..');
const allowed = new Set([
  'apps/api/src/config/__tests__/s3.test.ts',
  'apps/api/src/middleware/__tests__/auth.middleware.test.ts',
  'apps/api/src/utils/__tests__/validator.test.ts',
  'apps/api/test/credentials.routes.test.ts',
  'apps/api/test/credentials.postgres.test.ts',
  'apps/api/test/email.service.test.ts',
]);
const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
function result(file) {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'apps/api/coverage', file), 'utf8'));
  if (!raw.success || raw.numFailedTests || raw.numFailedTestSuites) throw new Error('passing_test_evidence_required');
  return {
    execution_started_utc: new Date(raw.startTime).toISOString(),
    tests: raw.numTotalTests, passed: raw.numPassedTests, skipped: raw.numPendingTests, failed: raw.numFailedTests,
    suites: raw.testResults.map((suite) => {
      const relative = path.relative(root, suite.name).split(path.sep).join('/');
      if (!allowed.has(relative)) throw new Error('unapproved_evidence_source');
      return { file: relative, status: suite.status,
        passed: suite.assertionResults.filter((test) => test.status === 'passed').length,
        skipped: suite.assertionResults.filter((test) => test.status === 'pending').length };
    }),
  };
}
const api = result('hardening-results.json');
const postgres = result('hardening-postgres-results.json');
const android = ['testDebugUnitTest', 'testReleaseUnitTest'].map((variant) => {
  const folder = path.join(root, 'apps/mobile-android/app/build/test-results', variant);
  const reports = fs.readdirSync(folder).filter((name) => name.endsWith('.xml')).map((name) => {
    const xml = fs.readFileSync(path.join(folder, name), 'utf8');
    const attrs = xml.match(/<testsuite\s+([^>]+)>/)[1];
    const number = (key) => Number(attrs.match(new RegExp(`\\b${key}="(\\d+)"`))[1]);
    return { tests: number('tests'), failures: number('failures'), errors: number('errors') };
  });
  const totals = reports.reduce((a, b) => ({ tests: a.tests + b.tests,
    failures: a.failures + b.failures, errors: a.errors + b.errors }), { tests: 0, failures: 0, errors: 0 });
  if (totals.tests !== 14 || totals.failures || totals.errors) throw new Error('current_android_contract_evidence_required');
  return { variant, ...totals };
});
const sourceFiles = [...allowed,
  'apps/api/src/routes/credentials.routes.ts', 'apps/api/src/middleware/tenant.middleware.ts',
  'apps/api/src/middleware/audit.middleware.ts', 'apps/api/src/middleware/http.middleware.ts',
  'apps/api/src/types/express.d.ts', 'apps/api/src/server.ts',
  'apps/api/src/services/email.service.ts', 'apps/api/src/services/scheduler.ts',
  'apps/api/src/routes/alerts.routes.ts', 'apps/api/src/config/init-credentials-table.sql',
  'apps/api/src/config/init-audit-table.sql', 'apps/api/jest.config.js',
  'apps/api/scripts/test-postgres.cjs', 'apps/api/scripts/write-control-evidence.cjs',
  'apps/web/src/components/types.ts', 'apps/web/src/App.tsx',
  'apps/mobile-android/app/src/main/java/com/matmoud/app/data/api/Credential.kt',
  'apps/mobile-android/app/src/test/java/com/matmoud/app/auth/CredentialContractTest.kt',
];
const apk = 'apps/mobile-android/app/build/outputs/apk/debug/app-debug.apk';
const summary = {
  schema_version: 2, review_date: '2026-10-29',
  base_revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  source_state: 'Hardening changes on the base revision; tested source bytes identified by source_sha256.',
  api, postgres, android,
  debug_apk: { bytes: fs.statSync(path.join(root, apk)).size, sha256: digest(apk) },
  scope: 'Synthetic fixtures only. HTTP unit tests double identity, DB transport, and S3; PostgreSQL tests use a disposable restricted-role DB with identity/S3 doubles. Android tests are JVM tests, not device or cloud E2E.',
  source_sha256: Object.fromEntries(sourceFiles.sort().map((file) => [file, digest(file)])),
};
fs.writeFileSync(path.join(root, 'docs/evidence/CONTROL-TEST-RESULTS.json'), JSON.stringify(summary, null, 2) + '\n');
console.log('[EVIDENCE] Sanitized aggregates and source hashes written');
