# AI Agent Handoff — MAT/MOUD Clinical Compliance Suite

> **Top rule:** Plan Phase B only. No file edits, installs, commits, or merges until Ron says approved. Pushing a branch for CI is allowed.
>
> **No agent merges:** an agent may merge only when Ron explicitly authorizes that particular PR. Approval of a plan, a green check, or an earlier PR is not approval to merge another PR.

**Written:** 2026-10-31 (local workstation time)
**Repository:** `IAM-ZeroTrustRon/MATMOUD-clinical-compliance-suite`
**Live workspace:** `C:\Projects\clinical-compliance-suite`
**Reviewed baseline:** `main` at `097adad` (PR #17 merge)

## 0. Status right now

- **PR [#17](https://github.com/IAM-ZeroTrustRon/MATMOUD-clinical-compliance-suite/pull/17) is merged** as `097adad2b807ec74357f1e23338f5e3103a01e71` at **2026-10-31 04:16:29 UTC / 2026-10-31 00:16:29 EDT**. All three required checks passed on its head `3c36593` ([run 41167003704](https://github.com/IAM-ZeroTrustRon/MATMOUD-clinical-compliance-suite/actions/runs/41167003704)): API tests and web build, PostgreSQL isolation, Android JVM + debug APK. The hosted API job logged `87 passed, 7 skipped, 94 total` and the PostgreSQL job `7 passed`, so CI executed the suites rather than reporting a cached success.
- Authorized PR merges use **Create a merge commit**. No squash, no rebase; the top no-agent-merges rule applies.
- Reviewed `main` baseline: `097adad`. Branch protection is admin-enforced, 0 required approvals, three strict required checks, no force push, no deletion. The old remote `chore/baseline-exposure` branch is absent.
- This handoff was read in full before publication through its own documentation PR. Phase B remains planning-only until Ron approves its plan.

> **Workspace trap — read before touching any file.** The coding agent's workspace root is
> `C:\MOUD-Compliance-Security-Audit`, and it contains an older recovery copy at
> `C:\MOUD-Compliance-Security-Audit\clinical-compliance-suite`. Schema-less relative paths
> such as `clinical-compliance-suite/docs/SECURITY_DEBT.md` resolve against that root, so they
> silently read and write the **old copy** while reporting success. This has already
> happened once during a handoff. Use absolute paths under
> `C:\Projects\clinical-compliance-suite`, or `cd` there first, and confirm with `pwd` and
> `git rev-parse --show-toplevel`.

> **Read this whole file before changing anything.** This repository is a GRC artefact as
> much as a codebase. Several practices exist so a claim can be reproduced by an auditor.
> Breaking one silently is worse than breaking code, because the code still passes.

---

## 1. What this project is

A HIPAA / 42 CFR Part 2 credential-tracking and expiration-alerting application for
medication-assisted treatment (MAT/MOUD) clinics. Three clients share one API: a React web
console, an Android companion app, and the API itself. It tracks clinician credentials
(licences, DEA registrations, certifications) and alerts compliance staff before they lapse.

Two things distinguish it from a typical CRUD app:

1. **Tenant isolation is structural.** Each tenant's rows are protected by PostgreSQL
   row-level security driven by a per-request session variable, and the test suite proves
   cross-tenant reads fail instead of asserting the code "looks right."
2. **The audit trail is a product feature.** Every credential read and document retrieval is
   meant to leave an immutable audit record. The repository distinguishes *"we built it"*
   from *"we can prove it at this commit"* throughout.

**Beta scope guard — do not add:** SMS alerts or SMS MFA, wound-care or image workflows, EHR
integrations (Epic/Cerner/HL7/FHIR), advanced analytics or reporting, billing automation,
research portals, anonymisation. Baseline is
`.github/instructions/clinical-compliance-security.instructions.md`. If a request touches one
of these, stop and surface it.

**Data rule:** synthetic data only. No real PHI, records, credentials, or keys in commits,
tests, logs, or fixtures. Fixtures use sentinels such as `SYNTHETIC_BLOCKED_VALUE` and
`*.example.test` addresses.

---

## 2. Repository topology — verified, not assumed

Confirmed by running `git rev-parse --show-toplevel` in each folder on 2026-10-31:

| Path | `rev-parse --show-toplevel` | Role |
| --- | --- | --- |
| `C:\Projects\clinical-compliance-suite` | `C:/Projects/clinical-compliance-suite` | **The application. The only live repo for app work.** |
| `C:\Projects\MOUD-Compliance-SecAudit` | `C:/Projects/MOUD-Compliance-SecAudit` | Independent security audit, findings matrix, GRC diagrams |
| `C:\Projects\Clinical_Compliance_Hub` | `C:/Projects/Clinical_Compliance_Hub` | Portfolio / case-study narrative |
| `C:\Projects\grc-case-study-clinical-compliance` | `C:/Projects/grc-case-study-clinical-compliance` | Older case-study checkout |
| `C:\MOUD-Compliance-Security-Audit` | `C:/MOUD-Compliance-Security-Audit` | **Second audit checkout** — the agent workspace root |
| `C:\MOUD-Compliance-Security-Audit\clinical-compliance-suite` | `C:/MOUD-Compliance-Security-Audit` | **Decoy.** Nested recovery copy of the app; it resolves to the *audit* repo above, not to itself. |

Note the last row: because the nested copy is not its own repository, a command run there
reports the audit repo's toplevel. That is how a relative path can look legitimate while
pointing at stale app code. `RELOCATED-WORKSPACE.md` in that folder says recovery only — do
not run Git or edit it.

Sibling state: `C:\Projects\MOUD-Compliance-SecAudit` has four **untracked items**:
`assets/botium-compliance-audit.png`, `assets/findings-matrix.png.html`,
`assets/mednet-detection-lab.png`, and `docs/iosapp.mp4`. These are three assets and one
video, not four files under `assets/`. Preserve all four. Also preserve
`C:\MOUD-Compliance-Security-Audit\RELOCATED-WORKSPACE.md` and every recovery copy.
That is someone else's in-progress work — **leave it alone.**

---

## 3. Stack and versions

**Monorepo:** npm workspaces, one root lockfile. The stale nested
`apps/api/package-lock.json` has been **deleted**; the root `install:all` runs `npm install`
at the workspace root.

**Runtime, pinned at `fa9b83b`:** `.nvmrc` = `24`, `engines.node` = `>=24 <25`, `.npmrc` has
`engine-strict=true`, CI uses Node 24, and `@types/node` declares `^24.18.0` in `apps/api`.

Two distinctions that are easy to get wrong:

- `^24.18.0` is a **range, not a pin**. The lockfile resolves the API's own copy to
  **24.19.2**; that is what `tsc` sees through `apps/api/node_modules`.
- `node_modules/@types/node` at the **root** is **26.6.6**, hoisted transitively by
  `@types/cors`. Reading that path tells you nothing about the API's types. Check
  `npm ls @types/node` before drawing conclusions.

**API** (`apps/api`) — Node/TypeScript, Express:

- `express@^4.22.3`, `proxy-addr@2.0.8`, `pg@^8.11.3`, `@sendgrid/mail@^8.1.0`,
  `@aws-sdk/client-s3@^3.500.0`, `jsonwebtoken@^9.0.2`, `jwks-rsa@^3.1.0`, `dotenv@^17.4.2`
- edge: `helmet`, `cors`, `express-rate-limit` (their own types; `@types/cors` is a dev dep)
- dev: `typescript@^5.3.3`, `jest@^29.7.0`, `ts-jest@^29.1.1`, `supertest@^6.3.4`,
  `ts-node-dev@^2.0.0`
- Root `qs` override pins 6.16.2 so Express does not resolve the vulnerable 6.15.4 copy.
  **Do not remove that override** without re-auditing.

**Web** (`apps/web`): React 18 + Vite 6 + `@auth0/auth0-react`. **Android**: Kotlin, Compose
BOM 2024.06.00, `compileSdk 35`, `minSdk 26`, `targetSdk 34`, Gradle wrapper checksum-pinned.

**Database:** PostgreSQL 16 and 18 installed; servers on **5432 and 5434**. RLS is enforced
through `set_config('app.current_tenant_id', …, true)` inside a per-request transaction
(`apps/api/src/middleware/tenant.middleware.ts`).

**Auth:** Auth0 JWT verified against JWKS. MFA mandatory by policy; TOTP or hardware keys
only; SMS MFA prohibited.

---

## 4. Security model you must not weaken

- **Tenant context.** `tenant.middleware.ts` opens a transaction and sets
  `app.current_tenant_id` with `SET LOCAL` semantics. Handlers use `req.dbClient` and filter
  on `current_setting('app.current_tenant_id', true)`. Do **not** reintroduce shared-pool
  queries for tenant data; a pool connection carries no tenant context.
- **RBAC.** `apps/api/src/middleware/rbac.ts` exposes `ROLES`, `TIER`, `requireRole(...)`,
  `requireMinTier(...)`, `maskPhiFields(...)`. Roles map to tiers via `ROLE_TO_TIER`, while
  the security baseline names roles (`org_admin`, `compliance_lead`, `operations_lead`,
  `viewer`) and some routes are written against tiers. **Reconcile the vocabulary before
  changing authorisation**, and read the file rather than trusting this summary.
- **PHI reads fail closed.** Credential list and document retrieval `await`
  `auditPhiRead(...)`; if the audit insert fails, no data and no signed URL are returned and
  the request 500s. Preserve the order: audit first, release second.
- **Edge controls added in PR #17** (`apps/api/src/server.ts`), in this order —
  `helmet` → `cors` → rate limiters → route-level auth:
  - CORS reads `CORS_ORIGINS` (comma-separated). In production an unset value refuses
    **every** origin; there is no localhost fallback. The Android client sends no `Origin`,
    so CORS does not apply to it.
  - `TRUST_PROXY_HOPS` (default `0`) drives `trust proxy`. Set it to the real number of
    managed proxies. Wrong values either collapse all users into one limiter bucket or let a
    client spoof its address.
  - Limits: `RATE_LIMIT_MAX` (default 600 / 15 min) general, and
    `RATE_LIMIT_SENSITIVE_MAX` (default 60 / 15 min) on `/alerts`, the route with the SendGrid
    side effect. `/health` is exempt. There is no `/auth` route to give a stricter budget.
  - `x-powered-by` is disabled; `Cache-Control: no-store` applies to success, denial,
    parser-error, and health responses alike.
- **Documents.** Storage keys never appear in list or upload responses; clients get
  `has_document: boolean`. Retrieval mints a presigned URL with a 300-second TTL
  (`SIGNED_URL_TTL_SECONDS`). Never raise it for convenience; stream through the API instead.
- **Email.** `email.service.ts` allowlists template fields to an opaque credential UUID and a
  real calendar date, rejecting everything else including nested objects.
- **Errors.** `apiErrorHandler` returns a fixed `internal_error` body in every environment,
  because a stack trace or SQL fragment is never a safe debug aid.

---

## 5. Evidence — what is fresh, what is cached

Manifest: `docs/evidence/CONTROL-TEST-RESULTS.json`, rendered into `docs/CONTROL-EVIDENCE.md`
(35 controls: description, test, evidence location, limitations). Regenerate with:

```bash
node apps/api/scripts/write-control-evidence.cjs
```

The generator does **not** run tests. It reads jest artefacts from `apps/api/coverage/`
(`hardening-results.json`, `hardening-postgres-results.json`). A regeneration therefore
records whatever the last run produced — **stale artefacts regenerate stale timestamps.**
Always re-run the suites, then regenerate, then confirm the recorded `execution_started_utc`
is newer than the moment you started the run. That exact check caught an earlier regeneration
that had carried a pre-pin API result forward.

**Recorded at `3c36593` (`base_revision` `3cdcaca`):**

| Suite | Result | Nature |
| --- | --- | --- |
| API Jest | 87 passed, 7 opt-in skipped, 0 failed (94 total) | fresh, `2026-10-31T03:56:18Z`, Node 24.18.0 |
| PostgreSQL isolation | 7/7 passed, disposable fixture dropped | fresh, `2026-10-31T03:59:45Z`, Node 24.18.0 |
| Android JVM + debug APK | `BUILD SUCCESSFUL`, 14 cases per variant | **cached** — `UP-TO-DATE`, Oct 30 00:58 outputs |

Both Node suites were re-executed after the runtime pin, so the Node 24 claim rests on the
recorded execution and not on inference. The Android row remains a cached attestation because
no Android source or Gradle input changed; hosted CI re-executes it. **Hosted CI results are
not inputs to this manifest** — they live in GitHub Actions and must be cited as such.

**Hash attestation.** `source_sha256` maps 34 allowlisted files to the SHA-256 of their
content after CRLF→LF normalisation (`.gitattributes` pins `* text=auto eol=lf`). Verified
**34/34 against committed Git blobs** at `3c36593`, with `base_revision` confirmed an ancestor
of `HEAD`. Verification must use `git show HEAD:<path>`, not the working tree, because a
checkout is what an auditor reproduces.

The generator now sorts suites by path. Jest reports completion order, which varies per run;
without the sort every regeneration produced a diff that looked like test files had vanished.

Rule: if you did not run it at this revision, say so. When a suite is cached, skipped, or
opt-in, the manifest must carry that status.

---

## 6. Advisory record (measured, now corrected in all three documents)

`docs/SECURITY_DEBT.md`, `docs/CI-VALIDATION.md`, and `docs/CONTROL-EVIDENCE.md` were
corrected from a pre-install figure of "10 remaining, all low, none moderate" to the measured
position on the completed install:

| Scope | Critical | High | Moderate | Low | Total |
| --- | --- | --- | --- | --- | --- |
| Production (`npm audit --omit=dev`) | 0 | 0 | 0 | **4** | 4 |
| Full tree including dev | 0 | 0 | **19** | **7** | 26 |

- The 4 production advisories are the SendGrid chain: `@sendgrid/mail`, `@sendgrid/client`,
  `@sendgrid/helpers`, `deepmerge`.
- The 19 moderate and 3 of the low are development-only, from the Jest 29 chain and
  `ts-node-dev`. None ship to production.
- Every automated remedy still requires a major downgrade (Jest/ts-jest, SendGrid), so those
  remain deferred. **Follow-up due 2026-11-30.**

Quote both rows. Quoting only the total blurs production exposure with dev tooling, which is
the number a reviewer actually cares about.

---

## 7. Environment traps that have cost hours

**Check the runtime before any work.** The correct precondition, because putting Node 24
first on `PATH` only helps if `npm` resolves to the same install:

```bash
node -v && npm -v && which node && which npm
```

As of this writing both resolve to `C:\Program Files\nodejs` — Node **v24.18.0**, npm
**11.16.0**.

**Trap 1 — do not prefix `npm` with `NODE_OPTIONS`.** The IPv4 workaround

```bash
NODE_OPTIONS="--dns-result-order=ipv4first --maxsockets=64" npm ci --ignore-scripts
```

**breaks npm on this machine**: npm re-invokes node, and the preloaded option confuses its
Node lookup, so the install fails for reasons unrelated to the registry. It appeared to work
once and misled an earlier session into treating it as the fix. Use plain `npm ci` /
`npm install`. If IPv4-first resolution is genuinely needed, set it in `.npmrc` rather than
the environment. Also: `npm cache clean --force` makes the *next* install slower (every
tarball revalidates) — only do it when corruption is suspected.

**Trap 2 — the C: volume is nearly full.** It has been at ~2.3 GB of 238 GB free, which
produced `ENOTEMPTY` and `ENOENT TAR_ENTRY_ERROR` during extraction that looked exactly like
a broken lockfile. Check `df -h /c` before installing and look at free space before you look
at `package-lock.json`.

**Trap 3 — two forks of `clinical-compliance-suite`.** See section 2. A write that reports
success is not evidence the live repo changed; verify with `git status` inside
`C:\Projects\clinical-compliance-suite`.

**Trap 4 — tests that import `server.ts` need Auth0 configuration.** `auth.middleware.ts`
throws at import when `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, and the namespace are missing. A
local `.env` masks this, so such a test passes here and fails in CI. Stub identity in the
test (as `http-hardening.test.ts` does) or the check is not reproducible. This has already
caused one red CI run after a green local one.

**Other facts:**

- **JDK 17** at `C:\tools\jdk17\jdk-17.0.20.1+1`. Under Git Bash `cmd //c gradlew.bat` does
  not resolve; invoke the wrapper JAR and pass the JDK explicitly.
- **Android SDK** path lives in `apps/mobile-android/local.properties` (untracked).
- The PostgreSQL runner needs `--local` to use the app's `DATABASE_URL`; without it the case
  fails on `test_admin_configuration_required`.
- Shell is Git Bash; use POSIX syntax. Never `> nul` (it creates a file named `nul`).

---

## 8. Validation commands

```bash
cd /c/Projects/clinical-compliance-suite

npm install                      # root workspace; plain, no NODE_OPTIONS prefix
npm run build                    # api tsc + web vite

# API suite, writing the artefact the evidence generator reads
cd apps/api
npm test -- --runInBand --json --outputFile=coverage/hardening-results.json

# PostgreSQL isolation suite (disposable DB; never point at production)
npm run test:postgres -- --local

# Android (JDK 17 required)
cd ../mobile-android
java -Dorg.gradle.java.home="C:\tools\jdk17\jdk-17.0.20.1+1" \
  -classpath gradle/wrapper/gradle-wrapper.jar org.gradle.wrapper.GradleWrapperMain \
  testDebugUnitTest testReleaseUnitTest assembleDebug

# evidence — only after the runs above, then verify the recorded timestamps moved
cd ../..
node apps/api/scripts/write-control-evidence.cjs
```

Expected: 87 passed / 7 skipped / 94 total for the API; 7/7 PostgreSQL with the fixture
dropped. Any other number means something changed — investigate before regenerating.

---

## 9. Dependabot backlog

Merged into `main` during this pass: **#7** (`@aws-sdk/client-s3`), **#10** (pg +
`@types/pg`), **#14** (`@aws-sdk/s3-request-presigner`), **#16** (`@auth0/auth0-react`).
Strict protection serialises these, so each later merge needs its branch refreshed first.

**Open, parked as a majors batch:** **#4**, **#5**, **#6** (setup-node 6→7, checkout 6→7,
setup-java 5→6 — major semver for the actions themselves), **#11** (`@types/node` 20→26,
which is behind the runtime), **#12** (vite 6→8), **#13** (`@vitejs/plugin-react` 4→6).
Green checks on these do not mean safe; they need a human read and a real build.

**Red:** **#9** (TypeScript 5.9.3→7.0.2, four failing checks) and **#8** (React 18→19).

**Trap:** **#15** bumps `react-dom` to 19 while React stays on 18 and its checks are green.
It is #8's companion, not an independent bump; merging it alone produces a runtime mismatch
that CI cannot see. Merge #15 with #8 or not at all.

Do not enable auto-merge: an unreviewed major landing on a "compliance-validated" branch
invalidates the evidence story.

---

## 10. What blocks non-synthetic data — five gates

1. **Least-privilege runtime database role.** The locally configured role is a superuser with
   RLS bypass and audit UPDATE/DELETE rights. Isolation is proven only under a role the app
   does not run as. Create the restricted role and re-prove isolation under it.
2. **SSN encryption.** `credentials.ssn` is plaintext. AES-256-GCM with KMS-backed keys,
   decrypt only for Tier 4+ reads, and a migration to encrypt existing rows.
3. **Audit-write atomicity for mutations.** `createAuditMiddleware` writes asynchronously, so
   a mutation can commit without its audit record. Reads fail closed; mutations do not yet.
   This is the largest audit-integrity gap.
4. **CEU tenant-referential integrity.** CEU tables still use single-column foreign keys, so a
   cross-tenant credential reference is accepted (`feat/ceu-tracking-migration`).
5. **Signed BAAs.** No hosting or provider BAA is in place. Until one is, the pilot is
   synthetic-data only and must be described that way.

---

## 11. Recommended next work, in order

**Immediate authorization is a Phase B plan only.** The proposed audit-document targets
are `C:\Projects\MOUD-Compliance-SecAudit\README.md`,
`C:\Projects\MOUD-Compliance-SecAudit\docs\Management_Risk_Remediation.md`, and
`C:\Projects\MOUD-Compliance-SecAudit\docs\IAM_Control_Review.md`. Name the exact edits,
the files that will remain untouched, the branch to be created in the audit repository
(not `main`), and the checks. Propose one consistent findings-count reconciliation across
all three documents; verify it against the original findings instead of inventing totals.
MOUD-11 and MOUD-15 closure claims must cite tests in the **application** repository,
including `C:\Projects\clinical-compliance-suite\apps\api\test\http-hardening.test.ts`
and `C:\Projects\clinical-compliance-suite\apps\api\test\rate-limit.test.ts`, plus the
assessed revision and dated results. Do not imply those tests live in the audit repository
or establish production effectiveness. No app-code changes are authorized. Wait for Ron's
approval. The engineering backlog below is deferred, not an instruction to execute now.

1. **Completed: PR #17 merged** as `097adad` at 2026-10-31 04:16:29 UTC
   (00:16:29 EDT). The live checkout was verified on `main` at that merge; use fast-forward
   updates when appropriate, never rewrite the merged history.
2. **CEU migration** on `feat/ceu-tracking-migration` (one commit ahead of `main`): composite
   unique constraints on parents, `(tenant_id, id)` composite foreign keys, RLS on every new
   table, `ON DELETE RESTRICT` plus `deleted_at` instead of cascade, per-board renewal cycles
   rather than a hardcoded 24-month lookback, and tests for both a fresh database and one
   where the init SQL is already recorded in `schema_migrations`. Cross-tenant negative tests
   prove the fix.
3. **Least-privilege role**, then re-run the isolation suite under it (gate 1). This converts
   "isolation works for our test role" into "isolation is enforced for the account we run as."
4. **Mutation-audit atomicity** (gate 3).
5. **Majors batch** — #11/#12/#13/#4/#5/#6 as one reviewed PR, plus #8+#15 and #9 separately
   or not at all.
6. **SSN encryption** (gate 2).
7. **Prototype staging**: separate Auth0 tenant with MFA and no SMS, managed Postgres with a
   *tested* restore, separate S3 bucket with SSE-KMS, secrets in the platform or CI store,
   structured logs without PHI, error and uptime alerts.
8. Disk space is an infrastructure risk, not a repo issue; an agent should not fix it
   unilaterally.

Cloud choice (AWS vs Azure) only gates item 7. The S3/KMS code presumes AWS and one BAA
covers the stack; Azure would require a storage-adapter rewrite.

---

## 12. How to work here without damaging it

- **Confirm you are in the live repo.** Absolute paths, or `cd` first. Verify with
  `git rev-parse --show-toplevel`.
- **One writer at a time.** Run `git status` and `git log --oneline -3` before editing. Never
  `git add -A`, `git stash`, `git checkout -- .`, or `git reset --hard`. Stage explicit paths.
- **Never push to `main`.** Branch, open a PR, and let the three required checks pass.
  No agent merges without Ron's explicit authorization for that particular PR; an
  authorized merge uses a merge commit.
- **No AI attribution, "generated with" footers, or percentage tags** anywhere.
- **Re-verify hashes after touching a hashed input** (34 allowlisted files include
  `.gitattributes`, `.github/dependabot.yml`, the generator itself, and both new test suites).
  Docs are generally not hashed — confirm before assuming.
- **Distinguish executed from cached** in every claim (section 5).
- **Synthetic data only.** Sentinel values, `example.test` domains.
- **Leave other people's uncommitted work alone**, including the untracked audit assets.

---

## 13. Where to read next

Paths relative to `C:\Projects\clinical-compliance-suite`.

| File | Why |
| --- | --- |
| `.github/instructions/clinical-compliance-security.instructions.md` | Non-negotiable baseline |
| `docs/SECURITY_DEBT.md` | Deliberate deferrals and the measured advisory record |
| `docs/CONTROL-EVIDENCE.md` | 35 controls with tests and limitations |
| `docs/evidence/CONTROL-TEST-RESULTS.json` | Machine-readable hash attestation |
| `docs/CI-VALIDATION.md` | What CI does and does not claim |
| `docs/HARDENING-2026-10-29.md` | The upload/audit/sanitisation pass |
| `docs/EXECUTION-STATUS-2026-10-20.md` | Source-referenced October review findings |
| `docs/COMMIT-MESSAGE-POLICY.md` | Commit conventions |
| `docs/WORKSPACE-LAYOUT.md` | How the three repositories were separated |

---

## 14. Bottom line

The application hardening is in good shape and honestly documented. Uploads are tenant-scoped,
storage keys no longer leak, PHI reads fail closed, errors are sanitised, the public edge now
carries security headers, a deny-by-default CORS policy, and rate limits, and tenant isolation
is proven by seven database tests against a disposable fixture. The evidence manifest is a
verified hash attestation over committed blobs, with its one cached and one fresh component
labelled correctly.

What remains is not polish. The five gates in section 10 — least-privilege runtime role, SSN
encryption, atomic mutation auditing, CEU tenant integrity, signed BAAs — are the difference
between a defensible synthetic pilot and handling real PHI. Nothing in this repository should
be described as production-ready for real clinic data before all five are closed.
