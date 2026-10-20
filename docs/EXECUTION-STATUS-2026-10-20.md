# Execution status — October 20, 2026

Application checkout: `feat/mobile-oauth-simplification`, reviewed from `f9bbb94`.
Scope: Android build/test verification, backend access/audit review, and review
of CEU commit `725a1ee`. No branch integration or deployment was performed.
The parent security-audit repository was not modified.

## Validation results

| Check | Result and scope |
| --- | --- |
| Android JVM suite | Passed: `testDebugUnitTest` and `testReleaseUnitTest`, 12 tests per variant, 0 failures/errors; `test` BUILD SUCCESSFUL in 7m 58s |
| Debug APK | Passed: `assembleDebug` BUILD SUCCESSFUL in 1m 4s; newly packaged October 20 APK |
| API TypeScript compilation | `npm run build` passed |
| API Jest suite | Passed: 3 suites, 35 tests, 0 failures; authentication-policy, upload validation, S3 tests |
| Restricted-role credential RLS | Passed synthetic two-tenant read/update probes; all writes rolled back |
| CEU tenant-consistent reference | Failed: cross-tenant credential reference was accepted; probe rolled back |
| Fresh baseline migration sequence | Failed at unconditional `patient_name` rename, SQLSTATE `42703` |
| CEU DDL application/replay | Passed twice in an isolated schema inside a rolled-back outer transaction |
| Device login/upload E2E | Not run; local unit tests do not establish Auth0/cloud/device integration |

The initial Gradle commands exited `9009` because this shell had neither
`JAVA_HOME` nor Java on PATH. A second invocation uses the existing installation
with a process-local environment change; no machine-wide environment was changed:

```powershell
Set-Location C:\MOUD-Compliance-Security-Audit\clinical-compliance-suite\apps\mobile-android
$env:JAVA_HOME = 'C:/tools/jdk17/jdk-17.0.20.1+1'
$env:PATH = "$env:JAVA_HOME/bin;$env:PATH"
.\gradlew.bat test
.\gradlew.bat assembleDebug
```

Installed SDK platforms include 34 and 35. JDK reports Temurin 17.0.20.1+1.
The Android suite contains 12 distinct tests executed in both build variants,
not 24 distinct test cases. Gradle emitted nonfatal kapt processor-option warnings.
Fresh XML report timestamps: debug `2026-10-20T16:57:16` UTC; release
`2026-10-20T16:59:04` UTC, each with 12 tests and zero failures/errors.
The APK is `app/build/outputs/apk/debug/app-debug.apk`, 16,203,384 bytes, packaged
at 1:00:16 p.m. America/New_York. SHA-256:

```text
ae00fcef5cab00d5fd8f412429db189c0d162e4bffd36bb1e378a892cd380495
```

Do not commit `local.properties`, build directories, APKs, tokens, or environment
files. Hardware-backed credential encryption remains device-dependent.

## Database state differs from source-branch state

Read-only catalog queries against the database configured for `apps/api` found:

- `credentials`, `credential_issuers`, `credential_ceus`, and `audit_events` exist.
- `schema_migrations` already records `init-ceus-and-issuers.sql`, as well as the
  four baseline migrations. This establishes local database application, not a
  source merge or proof of deployment elsewhere.
- Credential and CEU/issuer tables enable RLS with the transaction-local
  `app.current_tenant_id` policy. None forces RLS. `audit_events` has no RLS.
- The configured connection role is a superuser, has `BYPASSRLS`, owns these
  tables, and can UPDATE/DELETE audit events. RLS and audit immutability are not
  enforced against this configured account.
- `matmoud_writer` is neither a superuser nor a bypass-RLS role. Under
  `SET LOCAL ROLE matmoud_writer`, RLS is active for credentials and CEUs.
  That role cannot SELECT, UPDATE, or DELETE `audit_events`.

No real credential content, connection string, password, or role identity was
printed. Catalog checks were read-only. Synthetic probes were uncommitted and
finished with ROLLBACK, including all test schemas and DDL.

### Restricted-role probe

Within one transaction, two uniquely identified synthetic credentials were
inserted under two generated tenant slugs. The probe switched to
`matmoud_writer` and used `set_config('app.current_tenant_id', ..., true)`:

1. Tenant A selected only its own ID from the two known test IDs.
2. Updating tenant B's test credential as tenant A affected zero rows.
3. Switching the transaction-local tenant to B exposed only B's test ID.
4. Inserting a tenant-A CEU linked to B's credential succeeded. A savepoint
   rollback removed that probe, and the final rollback removed both credentials.

These checks demonstrate credential RLS behavior under the restricted role and
the CEU foreign-key defect. They do not prove isolation when the application
connects using the currently configured superuser.

## Backend review findings

| Priority | Finding | Source / consequence |
| --- | --- | --- |
| High | Configured API database role bypasses RLS and audit immutability | Confirmed by live role/catalog queries; explicit tenant filters do not replace database enforcement |
| High | Credential-list read audit fails open | `credentials.routes.ts`: `auditPhiRead(...).catch(...)` logs a failure but still sends the PHI response |
| High | Upload persistence bypasses request connection | `POST /credentials/:id/upload` uses `pool.query` for the credential UPDATE; its connection lacks the request's SET LOCAL context and can update zero rows while returning success |
| High | General error handling can expose sensitive error detail | `server.ts` logs the complete error/stack and sends `err.message`; production also receives the message, despite comments claiming a generic response |
| Medium | Audit feed does not work with the intended restricted writer grants | `audit.routes.ts` SELECTs audit events, but `matmoud_writer` has INSERT-only access; enabling SELECT safely requires tenant-scoped policy/design |
| Medium | Mutation audit is asynchronous and separate from transaction commit | `audit.middleware.ts` writes after response finish; write failure cannot retract a successful response and business write/audit are not atomic |
| Medium | Tenant transaction commits after every finished response | `tenant.middleware.ts` commits on `finish` without checking HTTP success; transaction outcome should be explicit and complete before success is returned |
| Medium | Sensitive read responses lack explicit no-store policy | Credential-list and document-URL handlers do not set `Cache-Control: no-store` |

These are review findings, not fixes performed in this session. The document
download URL handler already awaits its read audit and returns 503 if that write
fails; this is stronger than the list path. Read auditing uses `GET:credential`
and `GET:credential_document`. Tier 3 masks provider name, SSN, DOB, and license
number on the server; Tier 4+ receives those selected fields unmasked today.
The proposed reveal-only response model remains pending.

Choose a least-privilege runtime account and reconcile audit read permissions
before changing credentials/configuration. Merely switching to the current
writer role will expose the audit-feed permission failure. Do not broaden grants
on an unscoped audit table as a shortcut. Audit helpers currently write through
the pool without request-local tenant configuration; account for that when
introducing audit-table RLS rather than adding a policy that breaks audit writes.

## CEU migration review — hold integration

Reviewed `feat/ceu-tracking-migration` at `725a1ee` without checking it out or
merging it. The migration creates `credential_issuers`, `credential_ceus`, and
`credential_compliance_status(UUID)`, with TEXT tenant IDs, RLS, positive-credit
validation, verification statuses, and restricted mutation grants.

Confirmed issues and integration requirements:

1. **Tenant-consistent references:** the credential and issuer FKs use ID alone.
   RLS on the CEU row cannot enforce that its parent belongs to the same tenant.
   Use composite parent uniqueness/FKs including `tenant_id`, and clean up any
   existing inconsistent references before adding constraints.
2. **History retention:** deleting a credential cascades to its CEUs; issuer
   deletion clears the issuer reference. Reconcile these behaviors with retained
   compliance evidence before enabling deletion workflows.
3. **Compliance policy:** the helper calls a credential compliant if any verified
   CEU exists within the trailing 24 months. It does not enforce required hours,
   credential-specific renewal cycles, or a future course-date upper bound.
   Do not display this assumption as board-verified compliance.
4. **Function privilege:** the explicit EXECUTE grant does not revoke PostgreSQL's
   default PUBLIC EXECUTE; live ACL inspection confirmed PUBLIC execution access.
   Review and constrain the intended audience; SECURITY
   INVOKER still matters for underlying table permissions/RLS.
5. **Fresh database:** the earlier rename migration already fails when the
   initial schema creates `provider_name`. Fix the guarded rename while retaining
   its other ALTER statements.
6. **Migration atomicity:** SQL files run separately from the tracking INSERT;
   DDL COMMIT can succeed before tracking fails. `IF NOT EXISTS` does not reconcile
   an existing table's constraints or columns. Test recovery and upgrades as well
   as replay. Existing databases skip already-recorded files; new behavior needs
   newly registered migrations.
7. **Audit workflow:** verification fields on CEU rows are not a replacement for
   append-only operation/read events. CEU API routes, RBAC, audited verification,
   and Android CEU detail remain unimplemented on the active source branch.

The DDL test used a unique test schema and an outer transaction.
The harness excluded only top-level file BEGIN/COMMIT statements so that test
DDL could not persist. Both CEU applications succeeded. The baseline rename
failed with `42703` (undefined column). This test does not exercise the production
migration runner's tracking/commit lifecycle or concurrent runners. A final
catalog check found zero remaining probe schemas.

## Next execution order

1. Finish/reproduce Android and API checks and record exact outcomes.
2. Fix runtime least privilege, audit permissions/isolation, fail-closed reads,
   upload connection use, and sanitized errors with focused regression tests.
3. Correct fresh/upgrade migration handling and add tenant-consistent CEU FKs
   through an upgrade-safe migration; validate fresh and already-applied schemas.
4. Agree CEU renewal requirements before exposing computed compliance status.
5. Run Auth0/device E2E with synthetic data, then implement CEU/camera workflows.

Keep `feat/ceu-tracking-migration` and the parent portfolio repository separate
until a reviewed integration is ready. No customer data is authorized while the
SSN encryption debt in `docs/SECURITY_DEBT.md` remains unresolved.
