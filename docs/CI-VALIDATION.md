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
does not claim dependency vulnerability scanning. The local clean-install report
listed 22 advisories (10 low, two moderate, eight high, two critical); remediation
and applicability review remain open. No forced dependency upgrades were applied.

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
