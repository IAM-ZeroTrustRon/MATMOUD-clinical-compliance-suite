# Automated validation and merge readiness

The [Validation workflow](../.github/workflows/validation.yml) runs on pushes,
pull requests targeting `main`, and manual dispatch once available on the default
branch. Stable job names are:

| Check | Executed validation |
| --- | --- |
| API tests and web build | Root lockfile install, API TypeScript build, web TypeScript/Vite build, default Jest suite |
| PostgreSQL isolation tests | PostgreSQL 16 service, disposable database and restricted role, all seven real-SQL regressions |
| Android JVM tests and debug APK | JDK 17, compile SDK 35, Gradle wrapper, debug/release JVM tests and debug APK |

The default API suite intentionally skips the seven database cases; the separate
PostgreSQL job must also pass. Its administrative connection targets only the
ephemeral runner service. The runner creates a uniquely named fixture database
and NOSUPERUSER/NOBYPASSRLS role and attempts cleanup even after test failure.
It resolves Jest through Node's module resolver so workspace dependency placement
does not require an API-local `node_modules` directory.

Jobs use read-only repository permissions, SHA-pinned setup actions, bounded
timeouts, and checkout without persisted credentials. They do not deploy, run
cloud E2E tests, use application secrets, or upload environment files, raw logs,
database dumps, or APKs as artifacts. Android uses placeholder Auth0 settings;
successful compilation does not validate real login or camera behavior.

The locked npm install disables lifecycle scripts and automatic audit/funding
requests. The builds exercise the installed toolchain directly. This workflow
does not claim dependency vulnerability scanning. On October 30, the fresh local
audit reported 22 advisories before remediation; `npm audit fix` without
`--force`, an explicit patch-level Express pin, and a compatible root `qs`
override reduced that to 10 low advisories. No forced upgrades or major version
changes were applied. The remaining
advisories are documented in [SECURITY_DEBT.md](SECURITY_DEBT.md), including
the SendGrid compatibility constraint and the Jest development-tool chain.

### Dependency remediation status, October 30, 2026

`npm audit` against the root workspace lockfile reported 22 advisories before
this change (10 low, two moderate, eight high, two critical) and 10 after it
(10 low; zero moderate, high, or critical). Four of the remaining advisories sit
in runtime dependencies (`@sendgrid/mail`, `@sendgrid/client`,
`@sendgrid/helpers`, `deepmerge`); six are in the Jest/ts-jest development
toolchain. Every automated remedy for those ten requires a major downgrade, so
they are deferred with a documented rationale rather than force-fixed.

**This revision was not re-executed locally.** A clean dependency install could
not be completed on the Windows workstation used for this review: `npm ci` and
`npm install` both stopped at the same point (313 root and 83 workspace
directory entries), and later attempts failed extraction with repeated
`ENOTEMPTY` / `ENOENT` `TAR_ENTRY_ERROR`. Overlapping installs were ruled out
before the final attempt. The API Jest suite, the seven PostgreSQL cases, and
the Android JVM tests were therefore **not** re-run at this revision by local
execution, and no local result is claimed for them.

What was verified instead: `npm ci --dry-run` exits 0 against the updated
lockfile, so the lockfile and the root `qs` override are mutually consistent
and the hosted `npm ci` step should not fail on a lockfile mismatch; the
`npm audit` figures above are real measurements of the committed lockfile; and
the dependency diff was reviewed package by package. Hosted checks on this pull
request are the re-execution of record for all three suites.

**The evidence summary is stale at this revision.**
[CONTROL-TEST-RESULTS.json](evidence/CONTROL-TEST-RESULTS.json) still records
the pre-change inputs. A verification pass finds **26 of 30** `source_sha256`
entries matching the working tree; the four outstanding entries are precisely
the files this change touches (`package.json`, `package-lock.json`,
`apps/api/package.json`, `apps/api/scripts/write-control-evidence.cjs`). The
summary also predates `.github/dependabot.yml`, which the generator now hashes.
Recorded execution timestamps (for example `2026-10-30T04:58:33Z` for the API
suite) were left unchanged rather than refreshed, because refreshing hashes
without re-executing would assert that the new lockfile was the tested one.

Regenerate only after a real run at this revision:

```text
cd apps/api && npm test -- --runInBand --json --outputFile=coverage/hardening-results.json
cd apps/api && npm run test:postgres
cd apps/mobile-android && ./gradlew.bat --no-daemon test assembleDebug
cd apps/api && node scripts/write-control-evidence.cjs
```

Until that run completes and the regenerated report is reviewed, this change
should stay unmerged: merging it as-is would put a state on `main` whose
committed evidence fails its own hash check.

## Lint and release gates

The nonfunctional API `lint` script was removed: there was no ESLint dependency
or configuration. CI does not pretend lint passed. TypeScript compilation and
regression tests are the current automated checks; configured linting can be
introduced in a separate scoped change.

A passing workflow is evidence for its exact revision and environment. It does
not itself prevent merging a failed revision: repository rules must separately
require the three checks and appropriate review. This change does not alter
branch protection, grant approvals, merge to `main`, or certify compliance.
Inspect the actual Actions run before describing hosted validation as passed.
Local source hashes identify only the enumerated evidence inputs; they are not
an independent attestation that every control or deployment was verified.
Source hashes normalize CRLF to LF so Windows checkouts and canonical Git text
blobs produce the same digest; APK hashes use the original binary bytes.

## Merge procedure

Fetch `origin/main`, review the complete diff and current checks, and use a merge
commit to preserve the remediation history. The previous review at `5f4e343`
found the README changes composed cleanly with `origin/main` at `e2cabf0`.
Recheck after further changes; a conflict-free merge alone is not acceptance.
Keep CEU schema integration on its separate branch until its tenant foreign-key
and migration-runner issues are reviewed.

## Local verification, October 30, 2026

The root lockfile installed successfully with lifecycle scripts disabled. API
TypeScript and web TypeScript/Vite builds passed. `actionlint` 1.7.12 validated
the workflow; optional ShellCheck analysis was disabled because ShellCheck is
not installed locally. The actionlint release archive's SHA-256 matched its
published checksum before execution.

The API rerun passed 78 tests (seven opt-in cases skipped). The separate
PostgreSQL run passed all seven cases and completed fixture cleanup. The
[sanitized evidence summary](evidence/CONTROL-TEST-RESULTS.json) records those
execution times and source hashes, including the workflow and npm manifests.

`gradlew.bat --no-daemon test assembleDebug` succeeded from the new `C:\Projects`
application folder. The debug APK was rebuilt; the two JVM test tasks reused
Gradle's cached 14-case results per variant. This is a successful build in the
new layout, not a fresh device test or fresh local JVM execution. The hosted
Android job uses a clean checkout without a restored Gradle build cache.

The GitHub branch-protection endpoint returned **Branch not protected** for
`main`. No protection setting was changed by this work.

## Hosted verification, October 30, 2026

At `370aee8` (explicit Android SDK root), all three checks passed in
[Validation run 41019738828](https://github.com/IAM-ZeroTrustRon/MATMOUD-clinical-compliance-suite/actions/runs/41019738828).
The local branch was fast-forwarded to preserve that remote change, and its
workflow hash was refreshed in the evidence summary. Earlier local execution
timestamps were retained rather than representing the refresh as a new test run.
