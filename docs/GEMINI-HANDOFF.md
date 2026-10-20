# Gemini handoff: MAT/MOUD Clinical Compliance Suite

Updated: October 20, 2026. Owner: Ron Richardson (`IAM-ZeroTrustRon`).

Follow-up execution evidence: [October 20 validation and security review](EXECUTION-STATUS-2026-10-20.md).
For a ready-to-paste reply to Gemini's latest acknowledgement, use
[the next-session handoff](GEMINI-NEXT-SESSION.md).
That review found CEU tables already applied in the local database despite the
source branches remaining separate, plus a configured superuser connection that
bypasses RLS. Use that report for live-database findings; source-branch status
below does not imply database deployment state.

## Start here

This is a continuation brief assembled from the **local application repository, recorded build artifacts, and this project's chat history**. GitHub alone does not capture the full history. Read the status labels carefully: prototype behavior, agreed designs, implemented code, and tested behavior are different things.

Application repository: https://github.com/IAM-ZeroTrustRon/MATMOUD-clinical-compliance-suite

Local application root: `C:\MOUD-Compliance-Security-Audit\clinical-compliance-suite`.
The parent directory is a **different security-audit/portfolio Git repository**. Do not add the application as a nested repository or submodule to the parent, or publish private implementation material there by accident.

Read these files before changing code:

1. `.github/instructions/clinical-compliance-security.instructions.md` — project security and beta-scope rules; takes precedence over handoffs.
2. `apps/mobile-android/CLAUDE.md` — Android architecture, configuration, and recorded validation.
3. `docs/SECURITY_DEBT.md` and `SECURITY_AUDIT.md` — unresolved debt and remediation history.
4. This brief, then the actual source for the feature being changed.

README marketing language and old TODO checkboxes are not proof of compliance, production readiness, or current test results. MFA method restrictions here are project policy; do not describe a particular claim allowlist as a literal statutory requirement.

## Purpose and architecture

The suite manages clinician/staff credentials, renewal dates, compliance visibility, documents, alerts, and audit history for MAT/MOUD clinics. The core beta journey is login, add a credential, upload its document, set expiration, receive a compliance alert, and inspect compliance/audit status.

| Component | Implementation |
| --- | --- |
| API | `apps/api`: Node.js, Express, TypeScript |
| Database | PostgreSQL with raw SQL through `pg`; no Prisma, Drizzle, Mongoose, or query builder |
| Web | `apps/web`: React 18, Vite, TypeScript, Auth0 React SDK |
| Android | `apps/mobile-android`: native Kotlin, Compose, Hilt, Auth0.Android, OkHttp/Retrofit |
| Documents | AWS S3, SSE-KMS with customer-managed keys |
| Alerts | Server scheduler and SendGrid email service |
| Authentication | Auth0 RS256 JWTs, JWKS validation, mandatory project-approved MFA |

The npm workspaces are `apps/api` and `apps/web`. Android has its own Gradle root at `apps/mobile-android`; open that directory in Android Studio.

## Git state and completed commits

At inspection, the application checkout is on `feat/mobile-oauth-simplification`:

| Commit | Work |
| --- | --- |
| `059d972` | Phase 3b credentials dashboard consuming `GET /credentials` |
| `f9876a4` | Android Phase 2+3a foundation integrated into the monorepo |
| `23ceecc` | Nested case-study repository excluded from source control; local `main` base |
| `6c2d3e5` | Security remediation commit for MOUD-01/02/03/04/05/07/14 |
| `06ffe51` | Credential schema, PHI masking, and document endpoints |

`feat/ceu-tracking-migration` is a separate local/remote branch at `725a1ee`. Its CEU schema is **not integrated into the current Android branch or local main**. `feat/mobile-android-foundation` remains at `23ceecc`; the actual Android commits are on `feat/mobile-oauth-simplification`.

Before this documentation update, the Android feature branch was absent from the remote head listing; its two commits were local-only. On October 20, 2026, this session pushed `feat/mobile-oauth-simplification` to origin with upstream tracking, publishing those Android commits and the consolidated handoff. No main-branch merge or history rewrite was performed. Check live Git state before starting; these references are a dated snapshot.

The pre-existing `.gitignore` changes protect Android machine state, signing files, and generated artifacts. A local `Claude outputs/` directory contains portfolio drafts (`audit-heatmap.html`, `audit-methodology.mmd`, `linkedin-projects.md`); these are distinct from application documentation and should not be swept into a commit without review.

## Android: implemented behavior

- Phase 2+3a auth foundation is integrated and committed.
- `Auth0Client` wraps Auth0.Android 3.21.0. `WebAuthProvider` owns authorization code + PKCE, state/nonce handling, Custom Tabs, SDK ID-token validation, and redirect handling.
- The SDK's `RedirectActivity` handles callbacks. Hand-built PKCE generation, token exchange, callback parsing, and the custom `auth.matmoud.app` callback have been removed.
- Callback/logout URI: `{auth0Scheme}://{auth0Domain}/android/com.matmoud.app/callback`. Register both in Auth0. HTTPS App Links require the relevant signing fingerprint/domain association configuration.
- `SecureCredentialsManager` handles encrypted credential persistence and refresh. The custom token-store implementation and deprecated EncryptedSharedPreferences dependency were removed. Hardware backing depends on the device; it is not universally guaranteed.
- `TokenPayload` reads `{namespace}/amr` first, falling back to plain `amr` only when absent/null. A malformed namespaced value fails closed rather than using a permissive fallback.
- Accepted MFA markers match the backend: `mfa`, `totp`, `fido`, `fido2`. A missing claim or password/ambiguous OTP/SMS-only claims fail the gate. Auth0 factor configuration must enforce the actual permitted factors; marker parity alone does not prove which factor was used.
- Credentials failing the login MFA gate are not saved. The app's custom decoder is a claim reader, not a signature verifier; SDK validation and backend authorization remain essential.
- The app does not rerun its login MFA gate after silent refresh because refreshed ID tokens may omit `amr`. The API still checks access-token authorization/MFA claims. Verify the Auth0 Action and refresh flow end to end.
- Debug cleartext access is limited to emulator host alias `10.0.2.2`. Release builds do not include this exception. Android's cleartext block alone does not prove TLS 1.3 enforcement.
- Hilt provides the auth, networking, and API dependencies; Compose hosts login and dashboard navigation.
- Phase 3b credentials dashboard is implemented through `CredentialsApi`, `Credential`, and `CredentialsViewModel`, using `GET /credentials` with a renewed Bearer token.
- Masking comes from the server. Tier 3 receives `[RESTRICTED]`; the Android screen does not render SSN or DOB. Refresh failure returns the user to login.
- Retrofit 2.11.0/converter-gson share the OkHttp client. `MobileAPIClient` remains available for later document work.

Key source directory: `apps/mobile-android/app/src/main/java/com/matmoud/app/` (`auth`, `data/api`, `di`, `viewmodel`, `ui`).

## Validation evidence and build setup

Android `CLAUDE.md` records successful Windows validation on September 16, 2026: 12 JVM tests passed and `assembleDebug` produced the APK. Local XML reports in `app/build/test-results/testDebugUnitTest` and `testReleaseUnitTest` independently show **12 tests, 0 failures, 0 errors**, timestamped September 16. These are historical artifacts, not fresh October test runs. Device instrumentation and a full Auth0-to-upload flow remain unverified.

Earlier chat reports of 8, 11, or 13 tests and a missing JDK/SDK reflect earlier stages. Use the 12-test reports and current environment checks instead of repeating those obsolete statuses.

Pinned Android toolchain: Gradle 8.7 wrapper with checksum; AGP 8.5.2; Kotlin 1.9.24; JDK 17; compileSdk 35; minSdk 26; targetSdk 34. The module documents suppression of the AGP advisory for compileSdk 35. Reassess compatibility when upgrading rather than silently assuming this is a current supported production stack.

```powershell
Set-Location C:\MOUD-Compliance-Security-Audit\clinical-compliance-suite\apps\mobile-android
.\gradlew.bat test
.\gradlew.bat assembleDebug
```

Even JVM tests require Android SDK configuration because the Android Gradle plugin configures the project. Use forward slashes in ignored `local.properties` (`sdk.dir=C:/path/to/Android/Sdk`); unescaped Windows backslashes caused an earlier build failure.

Configuration names: `auth0Domain`, `auth0ClientId`, `auth0Audience`, `auth0Namespace`, `auth0Scheme`, `apiBaseUrl`, and `sdk.dir`. Audience/namespace must match the API. Keep real environment values and tokens out of commits. `http://10.0.2.2:3000` is for emulator debug work only.

API commands, from `apps/api`: `npm run build`, `npm test -- --runInBand`, `npm run migrate`, `npm run dev`. Web commands, from `apps/web`: `npm run build`, `npm run dev`. This documentation session does not claim those runtime checks were rerun.

## API and security behavior

Protected request flow: Auth0 verification, tenant transaction context, mutation audit middleware where applicable, route RBAC, handler. Tenant queries must use `req.dbClient`; tenant context is transaction-local `app.current_tenant_id`. Tenant IDs are TEXT and can be slugs, not necessarily UUIDs.

| Endpoint | Purpose |
| --- | --- |
| `GET /credentials` | Tenant-scoped credential list; Tier 3 masking; per-record read audit calls |
| `POST /credentials` | Create credential |
| `POST /credentials/:id/upload` | Document upload to S3 |
| `GET /credentials/:id/document` | Authorized signed document retrieval |
| `POST /alerts/run` | Run expiration alerts |
| `GET /audit-logs` | Tier-gated tenant audit feed |

The seed endpoint is environment-gated; inspect its registration before use. There is no `/api/user/credentials`, `/api/ceu/{id}`, or implemented dedicated reveal endpoint on this branch.

Roles map to Tier 3 limited access, Tier 4 clinical/backend access, and Tier 5 privileged access. The source includes more roles than the baseline file's short recognized-role list; resolve policy/code differences explicitly. A tier-preview UI never authorizes access.

The current list API returns unmasked selected PHI to Tier 4+. It does **not** implement the proposed reveal-only transport model. Its read-audit errors are caught/logged while returning the response; do not assume fail-closed audit delivery is already guaranteed.

Project requirements: AES-256 at rest, TLS 1.3 in production, customer-managed document keys, API-layer authorization, minimum necessary access, append-only audit history retained at least six years, no PHI in logs/emails/errors/URLs, and `// PHI` comments for sensitive code structures. Audit schema uses `occurred_at`; the baseline describes a timestamp requirement. Read audits currently use action names such as `GET:credential`; do not assume a `PHI_READ` event taxonomy is implemented.

**Synthetic data only:** `docs/SECURITY_DEBT.md` records plaintext `credentials.ssn`. KMS-backed AES-256-GCM encryption, migration, and Tier 4+ controlled decryption remain prerequisites for real SSNs.

Beta exclusions: SMS, wound care, EHR integrations, advanced analytics/reporting, billing automation, research portals, and anonymization features. Follow the exact baseline scope/conflict conventions.

## Database and CEU work: current versus proposed

Migrations are SQL files under `apps/api/src/config`, registered explicitly in `MIGRATION_FILES` in `run-migrations.ts`. The runner does not scan the directory. It tracks filenames in `schema_migrations`, skips applied files, and does not wrap each file plus its tracking record in one transaction. Use explicit transaction boundaries where required; idempotency needs deliberate handling of policies, constraints, triggers, and backfills beyond `IF NOT EXISTS`.

On this checkout, four migrations are registered. The initial schema already creates `provider_name`, but the later rename migration unconditionally renames `patient_name`; this known fresh-database failure remains present here. Preserve its nullable SSN/DOB and document-column statements when fixing the rename. Editing an already-applied migration cannot deliver new behavior to existing installations: add a newly registered migration for new triggers/schema.

The lifecycle column is `expiration_date`, **not `expires_at`**. A renewal reset for `last_alerted_at` was discussed but is not implemented on this checkout. The scheduler/service still flag that gap. A trigger referencing `expires_at` would break updates.

The separate CEU branch contains `init-ceus-and-issuers.sql`, registered there. Its actual design uses `credential_issuers` and `credential_ceus` with course credits and verification workflow, plus `credential_compliance_status(UUID)`. It is **not** the earlier proposed aggregate `ceus` table. The helper uses a trailing 24-month verified-CEU assumption; that is a proposed policy default, not validated board-specific renewal logic.

Before integrating that branch, review tenant-consistent foreign keys (single-column references do not guarantee matching tenants), deletion/cascade policy, grants, audit coverage, compliance assumptions, and fresh/existing database migration behavior. The branch includes `ON DELETE CASCADE` for credential CEUs, contrary to our discussed preference to preserve compliance history. No CEU API routes or Android CEU screen are completed.

## Chat-only prototype history and agreed designs

Ron reported a separate seeded mobile prototype with these completed UI flows; this is **user-reported prototype work, not verified native Android integration**:

- SSO login, TOTP keypad, compliance dashboard with 30-day/expired thresholds, credential detail, 8-second PHI reveal/re-mask, camera scanning entry, alert feed, and append-only audit presentation.
- Four explicit tabs with shield-check, bell, ledger, and person outline icons, replacing nested rendering control flow.
- Access-page “Preview a lower tier” toggle switching the app to a Tier 3 presentation: masks PHI and locks audit records.
- CRS, CHW, and CRC credential labels and a CEU detail section (completed/required credits, progress, renewal cycle date, status).
- Live API wiring, real camera permissions/OCR testing, and notification strategy were still open in that prototype report.

The chat does not establish the separate prototype's framework or source location. Locate and inspect its actual assets before porting; do not invent implementation status.

Agreed direction from discussions, still requiring implementation/validation:

1. Integrate clients into the existing monorepo and reuse the backend/auth/models/design tokens where they exist.
2. Tier 3 must never receive unmasked PHI. A preview toggle may lower presentation/access but never elevate permissions; server authorization remains authoritative.
3. Proposed Tier 4+ `POST /credentials/:id/reveal` should audit access and return only requested fields with `Cache-Control: no-store`. List/detail responses must be reconsidered if adopting reveal-only transport. The client must still re-mask after eight seconds, clear revealed state on background/navigation, and avoid persistent caching; a server cannot retract bytes already delivered.
4. Credential issuer claims remain unresolved. Earlier text incorrectly treated CRC/Clinical Research Coordinator as PCB-issued. Verify exact credential title, issuing body, registry evidence, and renewal requirements before enforcing mappings. ACRP/SOCRA distinctions discussed in chat are not a verified credential catalog. “Verified” requires recorded verification evidence/date.
5. Use CameraX permission handling and on-device ML Kit **text recognition** for license OCR, with manual confirmation. Face detection was an erroneous dependency choice and is not required.
6. No camera-roll saves; delete temporary captures after successful upload/appropriate cleanup; audit capture/upload and enforce tenant-scoped document access. Reuse existing S3/KMS backend patterns. Direct presigned upload is a proposed path, not a completed native flow.
7. Notification copy should be generic (“You have a compliance update”); fetch sensitive detail after authentication. Proposed server triggers are 90/60/30 days before expiry and on expiry, plus possible CEU pace checks. This multi-stage schedule is **not** the existing one-alert dedup implementation. Delivery-provider agreements, payload handling, and permitted transport require review before deployment; no blanket vendor/legal conclusion is established by this chat.
8. Reconcile alert history, renewal reset, recipient routing, and deduplication before adding push. SMS is outside beta scope.

## Recommended continuation

1. Inspect live Git status and preserve existing local work. Read the baseline and Android module notes.
2. Reproduce the Android tests/APK build and verify real Auth0 login, TOTP, namespaced claims, callback/logout, refresh, and the live credentials dashboard with synthetic data.
3. Test Tier 3 versus Tier 4 behavior and cross-tenant isolation through the API; validate audit delivery and error handling rather than inferring controls from UI badges.
4. Review/integrate CEU backend work on its own merits; fix migration/renewal gaps, define issuer/renewal policy, then implement audited CEU routes and contract tests.
5. Build CEUDetailScreen against the actual agreed API, then camera/OCR/document upload and device E2E coverage.
6. Implement the agreed alert strategy after its policy/content decisions are resolved.
7. Update documentation with exact commands/results and distinguish executed tests from intended checks. Keep secrets, PHI, local SDK paths, build artifacts, and unrelated portfolio drafts out of commits.

Use descriptive conventional commit subjects with the repository's `[AI ...%]` attribution suffix. Stage explicit paths, preserve prior commits, and push the intended feature branch. Do not rewrite history or merge branches merely to make a status display look clean.

## Suggested first prompt for Gemini

> Continue the MAT/MOUD Compliance Suite using this handoff, the actual local source, and the security baseline. Preserve existing work. First report the checked-out branch and whether the Android build, CEU schema, and backend routes match this brief. Treat chat-only prototype claims and proposed features as separate from implemented code. Work with synthetic data, use the Auth0 SDK and raw PostgreSQL/pg architecture, and update this handoff when implementation or validation changes.
