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
override reduced that to **4 low advisories in production**. The full tree,
including development tooling, reports **26** (19 moderate and 7 low); the
moderate findings are confined to the Jest 29 / `ts-node-dev` toolchain and are
never installed into a deployed process. No forced upgrades or major version
changes were applied. Both figures are documented in
[SECURITY_DEBT.md](SECURITY_DEBT.md), including the SendGrid compatibility
constraint and the Jest development-tool chain.

### Dependency remediation status, October 30, 2026

`npm audit` against the root workspace lockfile reported 22 advisories before
this change (10 low, two moderate, eight high, two critical). The position after
the compatible upgrades, measured on a complete 605-package install:

| Scope | Critical | High | Moderate | Low | Total |
| --- | --- | --- | --- | --- | --- |
| Production (`--omit=dev`) | 0 | 0 | 0 | 4 | 4 |
| Full tree including dev | 0 | 0 | 19 | 7 | 26 |

The four production findings are the SendGrid chain (`@sendgrid/mail`,
`@sendgrid/client`, `@sendgrid/helpers`, `deepmerge`). The 19 moderate findings
are development-only, reached through Jest 29 and `ts-node-dev`. Every automated
remedy requires a major downgrade, so they are deferred with a documented
rationale rather than force-fixed. An earlier revision of this section quoted
"10 remaining, all low" — that was measured before the install completed and
understated the development-toolchain position.

**Execution at this revision — October 30, 2026, evening.** The dependency
refresh was validated on the review workstation once the environment was
repaired. Two faults had been blocking it, neither of them the lockfile: the
C: volume was completely full (2.3 GB free of 238 GB), which caused the
`ENOTEMPTY` and `ENOENT TAR_ENTRY_ERROR` extraction failures, and registry
requests were stalling on IPv6 resolution, taking 37 s to 195 s each. After
removing the aborted install trees and the npm cache, resolving IPv4 first, and
raising socket concurrency, a clean `npm ci --ignore-scripts` completed with
**554 packages, no errors**.

Recorded results at this revision:

| Suite | Result | Executed |
| --- | --- | --- |
| API Jest | 87 passed of 94, 7 opt-in cases skipped, 0 failed | fresh — `2026-10-31T03:56:18Z`, Node 24.18.0 |
| PostgreSQL isolation | 7 passed; disposable fixture created and dropped | fresh — `2026-10-31T03:59:45Z`, Node 24.18.0 |
| Android JVM + debug APK | `BUILD SUCCESSFUL`; 14 cases per variant | **cached** — 00:58 outputs, tasks reported `UP-TO-DATE` |

Both Node suites were re-executed after the runtime pin (`fa9b83b`) rather than
carried over from the earlier run, so the timestamps above belong to runs made at
this revision under Node 24.18.0. The hosted jobs run the same runtime, but CI
results are recorded in GitHub Actions; they are not inputs to the evidence
manifest.

`npm audit` against the installed tree gives the figures in the table above: 4
low in production, 26 across the full tree, and no critical or high findings in
either scope. The Android figures are a cached-result attestation rather than
a fresh JVM execution, because no Android source or Gradle input changed in this
dependency-only change set; the hosted Android job re-executes the same tasks
from a clean checkout. The evidence summary was regenerated from these inputs
and now matches **34 of 34** `source_sha256` entries, including `.gitattributes`,
`.github/dependabot.yml`, and the two new regression suites.

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
