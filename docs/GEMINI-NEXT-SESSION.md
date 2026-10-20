# Reply to Gemini — verified execution handoff

Gemini, resume from the following verified October 20, 2026 results. Local
Gradle validation and CEU review have now been completed; we are past the
"ready whenever you give the signal" stage.

## Repository and references

- Application root: `C:\MOUD-Compliance-Security-Audit\clinical-compliance-suite`.
- Branch: `feat/mobile-oauth-simplification`. Preserve the separate CEU branch
  `feat/ceu-tracking-migration` at `9e7bc3b`; do not merge it into main yet.
- Read [the consolidated handoff](GEMINI-HANDOFF.md),
  [the execution report](EXECUTION-STATUS-2026-10-20.md),
  [security debt](SECURITY_DEBT.md), and
  [Android module notes](../apps/mobile-android/CLAUDE.md).
- `.github/instructions/clinical-compliance-security.instructions.md` remains
  the project rules of record. Keep the parent portfolio repo untouched.

## Completed validation

1. `gradlew.bat test`: BUILD SUCCESSFUL. All 12 JVM tests pass in both debug
   and release variants, with zero failures/errors. This is 12 distinct tests
   run in two variants, not 24 distinct cases.
2. `gradlew.bat assembleDebug`: BUILD SUCCESSFUL; a fresh debug APK was packaged.
   Its size/hash are recorded in the execution report. No APK is committed.
3. API `npm run build`: passed. API Jest: 3 suites, 35 tests passed.
4. Restricted-role database probes: tenant A/B read isolation passed; a
   cross-tenant credential UPDATE affected zero rows. All synthetic writes
   were rolled back.
5. CEU DDL applied and replayed successfully in an isolated test schema, also
   rolled back. Fresh baseline migration reproduced the provider-column rename
   failure (`42703`). This does not prove runner-level upgrade atomicity.

The shell initially lacked JAVA_HOME. The existing JDK was used by setting
JAVA_HOME to `C:/tools/jdk17/jdk-17.0.20.1+1` for the process. No installation
or machine-wide configuration change was needed. Android retains Auth0 SDK
Custom Tabs, SecureCredentialsManager, namespaced-first MFA claim handling,
and the Phase 3b Retrofit credentials dashboard.

## Findings that change the next steps

- **Database/source drift:** the local database already has `credential_ceus`,
  `credential_issuers`, and the CEU migration record, although the source migration
  remains on its separate branch. Inspect deployed schema before writing upgrades.
- **Runtime privilege:** the configured API database account is a superuser with
  RLS bypass and audit UPDATE/DELETE privileges. Passing tests under
  `matmoud_writer` does not establish isolation for that configured connection.
- **Audit permissions:** `matmoud_writer` cannot SELECT the audit feed. Audit RLS,
  read permissions, and the pool-based audit write paths must be designed together
  before switching to least-privilege runtime credentials.
- **CEU tenant integrity:** a synthetic tenant-A CEU referencing tenant B's
  credential was accepted. Single-column foreign keys do not enforce tenant
  consistency. The probe was rolled back; this needs an upgrade-safe fix.
- **Audit delivery:** credential-list read-audit failures still permit PHI
  delivery; mutation audit writes occur asynchronously after the response.
- **Upload persistence:** the upload UPDATE uses `pool.query`, bypassing the
  request connection and its transaction-local tenant context.
- **Error handling:** raw error messages and complete error logging remain in the
  global handler. Sensitive read responses also need explicit cache policy.
- **Migration and CEU policy:** the unconditional `patient_name` rename breaks
  fresh databases. CEU cascade deletion, PUBLIC function execution, and the
  "any verified credit in 24 months" compliance assumption need review.

These findings were documented, not remediated in this verification session.
No CEU integration, deployment, or production-readiness approval occurred.

## Proceed in this order

1. Review the execution report and preserve local work. Confirm branch/HEAD and
   upstream status before editing.
2. Fix runtime least privilege and tenant-safe audit access, fail-closed list
   auditing, upload connection use, and sanitized error handling, with focused
   regression tests. Do not merely broaden grants on the current unscoped audit table.
3. Fix fresh/upgrade migration behavior and CEU tenant-consistent references
   through newly registered SQL migrations that handle the already-applied schema.
4. Agree actual board-specific credits/renewal rules and preservation requirements
   before exposing a CEU compliance status or merging the CEU work.
5. Run real Auth0/device login, MFA, callback/logout, refresh, dashboard and upload
   E2E with synthetic data; then continue CEU/camera/OCR integration.

Continue using raw PostgreSQL/pg and the Auth0 SDK. Hardware-backed storage is
device-dependent. Keep synthetic data only while SSN encryption debt remains open.

## Authorship and readiness clarification

Human review and passing tests do not establish production readiness or turn
AI-assisted implementation into exclusively human-authored work. Describe
implementation, review, and verification accurately.

Ron subsequently instructed that **all AI percentage tags be removed from commit
messages across his GitHub repositories**. That instruction supersedes the earlier
suffix convention. The account-wide branch-history cleanup is documented in
[the commit-message policy](COMMIT-MESSAGE-POLICY.md). The tagging hooks were
disabled and their tracker extension was backed up and uninstalled. Use normal
conventional commit subjects without percentage tags going forward. Accurate
implementation and review descriptions remain separate from commit formatting.
