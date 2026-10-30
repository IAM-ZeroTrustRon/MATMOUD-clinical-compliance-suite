# Backend hardening and regression evidence — October 29, 2026

This change implements the agreed Option 2 sequence on
`feat/mobile-oauth-simplification`. It preserves multipart uploads, server-generated
document keys, the current SQL schema, and the Auth0/pg architecture. No CEU merge,
deployment, new filename column, or real-record test was performed.

## Changes and acceptance evidence

1. **Upload persistence:** ownership is checked through `req.dbClient` using the
   transaction tenant and `SELECT ... FOR UPDATE` before S3 is called. The same
   client updates `document_key`/`updated_at`, checks `RETURNING id`, and awaits
   `req.commitTenantTransaction()` before returning 201. Error responses roll back;
   transaction finalization releases the connection once. Both HTTP boundary tests
   and a real PostgreSQL test prove upload followed by document retrieval. A
   deferred PostgreSQL constraint-trigger test rejects COMMIT and proves the API
   returns 500 without persisting a key.
2. **List contract:** SQL derives `has_document`; an explicit response allowlist
   excludes storage keys and unexpected fields. Upload responses likewise omit
   the raw key. Web and Android consume the boolean. Tier 3 masking remains
   server-side. Tests cover true/false values, field projection, and restricted
   responses; Android adds a Gson contract test.
3. **Read audit gate:** both list and document routes await audit writes before
   returning records or minting a URL. Failure returns generic 500 with no partial
   list or signed URL. Tests fail both the first and a later list audit; the real
   database suite revokes INSERT on the audit table to prove actual denial.
   Read audits retain the existing `GET:credential`/`GET:credential_document`
   vocabulary and schema rather than introducing an incompatible `action` column.
4. **Errors, email, cache:** all API responses carry `Cache-Control: no-store`,
   including parser errors and denials. Driver/provider errors and stacks are
   neither returned nor logged, even in development. Health checks omit error
   detail and release their connection on failure. The mail service rejects unknown
   template fields and malformed UUID/date values before calling SendGrid, then
   projects only `credentialId` and `expirationDate`; the optional name field and
   shallow denylist were removed. Alert callers no longer return provider messages.
5. **Regression suite:** [HTTP route tests](../apps/api/test/credentials.routes.test.ts)
   run real Express/multipart/RBAC/tenant/error paths with deterministic PostgreSQL
   transport, identity, and S3 doubles; [mail tests](../apps/api/test/email.service.test.ts)
   capture provider calls without sending mail. The separate
   [PostgreSQL suite](../apps/api/test/credentials.postgres.test.ts) uses real SQL,
   transactions, row locks, RLS, and privileges with mocked identity/S3 boundaries.

## Alert outcome follow-up

The alert-run endpoint now exposes `emailed` and `audited` for every result.
If delivery succeeds but the separate audit write fails, it returns
`emailed: true`, `audited: false`, `success: false`, and the fixed code
`alert_audit_failed`. Deduplication tracking is still attempted. Tracking failure
after delivery retains the known delivery/audit facts with `alert_tracking_failed`.
`sent` counts delivered messages; `failed` counts undelivered messages;
`auditFailed` and `trackingFailed` expose the independent failures. A partial run
uses HTTP 200 with `status: completed_with_errors`, since a sent email cannot be
undone. Consumers must inspect results and must not blindly resend delivered items.

[Seven alert-route regressions](../apps/api/test/alerts.routes.test.ts) exercise
success, audit denial after delivery, send failure, tracking failure, mixed batch
counts, viewer denial, and lookup-error redaction using synthetic fixtures and
mocked mail/DB boundaries. These prove visibility, not durable audit retry or
atomicity between email, audit, and tracking. Tracking still relies on the request
transaction's finish-time commit; a late commit failure remains an open risk.

## Reproduce

```powershell
# From the application root:
npm run build --workspace=apps/api
npm test --workspace=apps/api -- --runInBand
npm run build --workspace=apps/web

# Local PostgreSQL integration, from apps/api:
npm run test:postgres -- --local

# Android, from apps/mobile-android with JDK 17 configured:
.\gradlew.bat test assembleDebug
```

Ordinary Jest runs intentionally skip the seven PostgreSQL cases unless the
disposable-test environment is configured. The
[runner](../apps/api/scripts/test-postgres.cjs) requires a local administrative
connection, creates a uniquely prefixed database and NOSUPERUSER/NOBYPASSRLS login,
installs the current credential/audit table definitions, and removes the fixture
database and role afterward. `--local` reads the existing ignored API `.env` only
to obtain a local administrative connection; alternatively set
`TEST_ADMIN_DATABASE_URL`. No existing application rows or runtime credentials
are modified. Original migrations are not repaired or validated by this fixture
setup, and the runtime application's role is not changed by the test.

## Results

- API TypeScript build: passed.
- Default API suite: 78 passed in six suites; seven opt-in PostgreSQL cases skipped.
- Separate real PostgreSQL run: seven passed, including actual audit-permission
  failures and deferred COMMIT failure; disposable cleanup completed.
- Web TypeScript/Vite build: passed.
- Android JVM tests: 14 distinct cases passed in each of debug and release
  (the 12 MFA/claims cases plus two document-contract cases); debug APK build
  passed. No emulator/device or real cloud E2E test was run.

API TypeScript, default Jest, and real PostgreSQL tests were rerun successfully
from `C:\Projects\clinical-compliance-suite` after relocation. The earlier web
and Android results above precede relocation; their source/build files were
preserved, and those builds were not repeated solely for the folder move.
See [workspace layout](WORKSPACE-LAYOUT.md) for recovery and repository boundaries.

[CONTROL-TEST-RESULTS.json](evidence/CONTROL-TEST-RESULTS.json) records aggregate
counts and tested source hashes. Raw Jest output stays under ignored
`apps/api/coverage`; Android XML/APK outputs stay under ignored build directories.
No real identities, document contents, signed URLs, connection strings, or cloud
keys are published as evidence.

## Remaining risks and Copilot review focus

Copilot can review the diff against its base with particular attention to the
ownership-before-S3 ordering, commit-before-success invariant, response field
allowlist, audit-failure paths, and runtime mail validation. Reproduce the commands
above; static review supplements the executed tests rather than replacing them.

S3 writes and PostgreSQL commits are not a distributed transaction: a database
failure after a successful upload may leave an unreferenced encrypted object.
No success is returned in that case, but orphan reconciliation remains open.
General mutation audit delivery is still asynchronous and not atomic with writes;
read audit writes still use their existing separate pool operation, so a future
audit-RLS/pool-capacity design must preserve fail-closed behavior. Other write
handlers still finalize on response finish unless they explicitly opt into the
new commit helper. Superuser runtime configuration, audit SELECT permissions/
immutability, retention, SSN encryption, denied-access logging, alert races/renewal
reset, cloud TLS/KMS policy proof, and CEU migration integrity remain unresolved.
