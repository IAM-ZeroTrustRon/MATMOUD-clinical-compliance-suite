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
  'apps/api/test/alerts.routes.test.ts',
  'apps/api/test/http-hardening.test.ts',
  'apps/api/test/rate-limit.test.ts',
]);
const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
// Allowlisted source inputs are UTF-8 text. Hash their canonical LF bytes,
// matching Git's stored text regardless of Windows checkout line endings.
const sourceDigest = (file) => crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'), 'utf8').digest('hex');
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
    // Jest reports suites in completion order, which varies between runs. Sort
    // by path so a regeneration diff shows result changes only, never suites
    // that appear to have vanished or gained tests by moving.
    }).sort((a, b) => a.file.localeCompare(b.file)),
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
  '.gitattributes',
  '.github/workflows/validation.yml', '.github/dependabot.yml',
  'package.json', 'package-lock.json',
  'apps/api/package.json', 'apps/web/package.json',
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
  schema_version: 2, review_date: '2026-10-30',
  base_revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  source_state: 'Validation changes on the base revision; tested source bytes identified by source_sha256.',
  api, postgres, android,
  android_results_origin: 'Gradle reported BUILD SUCCESSFUL at this revision with testDebugUnitTest, testReleaseUnitTest, and assembleDebug all UP-TO-DATE; the 14-case-per-variant XML results and the debug APK are the October 30 00:58 build outputs, reused because no Android source or Gradle input changed in this dependency-only change set. Treat the Android figures as cached-result attestation, not a fresh JVM execution. Hosted validation is recorded separately in GitHub Actions.',
  debug_apk: { bytes: fs.statSync(path.join(root, apk)).size, sha256: digest(apk) },
  scope: 'Synthetic fixtures only. HTTP unit tests double identity, DB transport, and S3; PostgreSQL tests use a disposable restricted-role DB with identity/S3 doubles. Android tests are JVM tests, not device or cloud E2E.',
  source_hash_representation: 'UTF-8 text with CRLF normalized to LF, matching canonical Git blobs; APK hash uses raw bytes.',
  source_sha256: Object.fromEntries(sourceFiles.sort().map((file) => [file, sourceDigest(file)])),
};
fs.writeFileSync(path.join(root, 'docs/evidence/CONTROL-TEST-RESULTS.json'), JSON.stringify(summary, null, 2) + '\n');
console.log('[EVIDENCE] Sanitized aggregates and source hashes written');
