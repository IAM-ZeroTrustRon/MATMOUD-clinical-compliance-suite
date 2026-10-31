# Security Debt Log

Tracked, deliberate deferrals — not oversights. Each entry requires
resolution before real (non-synthetic) data enters the system.

---

## Runtime Isolation, Audit Delivery, and CEU Integrity

**October 29 update:** [Option 2 hardening](HARDENING-2026-10-29.md) fixes upload
connection/ownership/commit handling, removes storage keys from list/upload
responses, makes credential reads fail closed on audit error, and sanitizes
server/health/provider errors. Cache headers and runtime email allowlisting are
covered by regression tests. The findings below describe the October 20 baseline;
remaining runtime-role, mutation-audit, audit-permission, CEU, and migration issues
are still open.

**Status:** Open — confirmed October 20, 2026; no remediation applied in this review.

See [the execution report](EXECUTION-STATUS-2026-10-20.md) for source references,
probe scope, and validation evidence. Confirmed blockers include:

- The locally configured database role is a superuser with RLS bypass and
  audit UPDATE/DELETE privileges. Use a least-privilege runtime role; reconcile
  tenant-scoped audit SELECT access before switching accounts.
- Credential-list audit failures do not prevent PHI delivery; mutation audit
  delivery is asynchronous and separate from business transaction commit.
- Upload persistence uses a shared pool query outside the request's tenant
  context; global error handling exposes raw error messages and full logs.
- CEU tables already exist locally, but single-column foreign keys accepted a
  synthetic cross-tenant credential reference. Add tenant-consistent constraints
  through a migration that also handles already-applied schemas.
- Fresh baseline migration fails at the unconditional provider-column rename.
  CEU compliance policy and cascade deletion also require review before integration.

Restricted-role credential isolation passed the synthetic read/update probes.
All probe writes and test schemas were rolled back. Passing those probes does
not establish RLS enforcement for the currently configured superuser account.

---

## Dependency advisories — compatible remediation applied

**Status:** Open — reviewed October 30, 2026; synthetic data only.

The October 30 fresh root-workspace audit initially reported 22 advisories:
10 low, two moderate, eight high, and two critical. `npm audit fix` was run
without `--force`. The resulting lockfile upgrades removed the high and
critical findings, upgraded Express to 4.22.3 and `proxy-addr` to 2.0.8, and
kept `@sendgrid/mail` on the existing 8.x line. A root `qs` override pins the
compatible 6.16.2 release so Express does not resolve the vulnerable 6.15.4
transitive copy.

**Measured on a complete install (605 packages), October 31, 2026 — both scopes,
because they differ materially:**

| Scope | Critical | High | Moderate | Low | Total |
| --- | --- | --- | --- | --- | --- |
| Production (`npm audit --omit=dev`) | 0 | 0 | 0 | 4 | 4 |
| Full tree including dev | 0 | 0 | 19 | 7 | 26 |

The four production findings are the SendGrid chain only: `@sendgrid/mail`,
`@sendgrid/client`, `@sendgrid/helpers`, and `deepmerge`. The nineteen moderate
findings and three of the low findings are development-only, reached through
the Jest 29 toolchain (`babel-jest`, `jest-config`, `jest-runner`, `minimatch`,
`rimraf`, `test-exclude`, `ts-node-dev`); none of them ship to a deployed
process.

**Correction:** an earlier revision of this register reported "10 remaining, all
low, none moderate." That figure was captured before the install completed, so
it missed the development-toolchain advisories. The numbers above are higher and
should be quoted as they stand. No critical or high findings remain, and every
automated remedy still requires a major downgrade of Jest/ts-jest or SendGrid, so
those changes remain deferred.

**Follow-up due:** 2026-11-30 — re-run `npm audit`, review patched SendGrid
and Jest-compatible releases, and remove the override if upstream dependency
ranges make it unnecessary. Do not enter real provider data until the open
encryption and runtime-role findings in this register are resolved.

**Validated at this revision — October 30, 2026 (evening).** After the desktop
environment was repaired (the C: volume had been full, and registry requests
were stalling on IPv6 resolution), a clean `npm ci --ignore-scripts` completed
with 554 packages and no errors. The API Jest suite passed **87 of 94** tests
with the seven opt-in PostgreSQL cases skipped (`2026-10-31T01:42:54Z`); the
nine new cases in `http-hardening` and `rate-limit` are inside that total. The
disposable PostgreSQL fixture passed all seven cases and was dropped
(`2026-10-31T01:44:12Z`), and the Gradle build reported `BUILD SUCCESSFUL`. The Android tasks were `UP-TO-DATE`,
so those 14-case-per-variant results are cached 00:58 outputs rather than a
fresh execution; that distinction is recorded in the evidence summary and the
hosted Android job re-executes them from a clean checkout.

When regenerated, [CONTROL-TEST-RESULTS.json](evidence/CONTROL-TEST-RESULTS.json)
matched **34 of 34** `source_sha256` entries, including `.gitattributes`,
`.github/dependabot.yml`, and the two new regression suites. The advisory figures quoted above come from that same
installed tree: 4 production low advisories, and 26 findings across the full
tree of which 19 are moderate and development-only.

---

## Duplicate workspace lockfile — `apps/api/package-lock.json`

**Status:** **Resolved** — October 31, 2026. The nested lockfile was removed with
`git rm`, and the root `install:all` script now runs `npm install` at the
workspace root instead of installing inside `apps/api`. A root install was then
re-run and regenerated only the root lockfile.
**Component:** `apps/api/package-lock.json` (tracked, 513 packages)

**Current state:** The repository carries two npm lockfiles for the same code.
CI installs from the root workspace lockfile only, and the control-evidence
generator hashes only that root file. The nested `apps/api` lockfile is left
over from the pre-workspace install path (the root `install:all` script still
uses `cd apps/api && npm install`) and is ignored by a workspace install.

**Measured divergence on October 30, 2026:** auditing the nested lockfile
reported 18 advisories (two critical, five high, one moderate, ten low), and it
still resolved `express` 4.22.2, `proxy-addr` 2.0.7, `body-parser` 1.20.6, and
`qs` 6.15.3 after the root workspace had been remediated. It resolves `express`
4.22.2, which no longer satisfies the `^4.22.3` manifest range, so a `npm ci`
run from inside `apps/api` fails on the lock/manifest mismatch.

**Why it matters:** An audit or install performed from the wrong directory
reports a materially different and worse vulnerability posture than the
pipeline enforces, which undermines the reproducibility claim for
build-input integrity. Dependabot is deliberately configured against the root
lockfile only, so nothing keeps this second file current.

**Resolution applied:** the nested file is gone, no workflow or script referenced
it, and `npm install` from the repository root succeeds against the regenerated
root lockfile. A stale-lockfile audit can no longer report a worse posture than
the pipeline enforces.

---

---

## Edge hardening — security headers, CORS, request throttling

**Status:** **Closed** — October 31, 2026, with regression tests.

**Was:** `server.ts` registered no `helmet`, no `cors`, and no rate limiter. Route
authentication protected data, but it ran only after a request was accepted, so an
unauthenticated caller could probe the process without limit and no security
headers or origin policy were ever emitted. This was the exposure that mattered
most, because it is live the moment the API has a public URL — before any
database control applies.

**Now:** `helmet` (framing, `nosniff`, HSTS, `x-powered-by` removed), then `cors`,
then the rate limiter, then route auth. CORS is an explicit allowlist from
`CORS_ORIGINS`; in production an unset value permits no cross-origin origin, and
the native Android client sends no `Origin` header so it is unaffected.
`/alerts` — the route with an outbound SendGrid effect — takes a tighter budget
than ordinary reads. `trust proxy` is set from `TRUST_PROXY_HOPS` so the limiter
and audit source address see the caller, not the proxy.

**Tests:** `apps/api/test/http-hardening.test.ts` (headers, allowlisted origin,
refused origin, preflight, `Cache-Control`) and `apps/api/test/rate-limit.test.ts`
(n+1 request returns 429 with a stable error body, tighter budget on `/alerts`,
`/health` exempt). Run against the previous `server.ts`, **6 of the 9 cases fail**;
the three that pass assert the absence of a header or the exemption of `/health`
and are therefore not discriminating on their own.

**Residual limits, not fixed here:** limiting is per client IP, so staff behind a
single clinic NAT share one budget (raise `RATE_LIMIT_MAX` for that deployment);
the limiter is in-process, so it does not coordinate across replicas — move the
store to Redis before horizontal scaling; and there is no `/auth` route to give a
dedicated bucket, so the stricter limit applies to `/alerts` instead.

---

## Line-ending normalisation — `.gitattributes`

**Status:** **Closed** — October 31, 2026.

**Was:** no `.gitattributes` existed, so a Windows checkout could materialise CRLF
while CI and Linux checkouts saw LF. Evidence hashes are computed over content
after CRLF-to-LF normalisation, which made a correct hash look wrong depending on
who cloned the repository.

**Now:** `* text=auto eol=lf` pins LF in the index and on checkout, with binary
types marked so assets are never rewritten. `git add --renormalize .` reported no
pending changes, which confirms the index was already normalised; the file now
keeps it that way for future checkouts.

---

## SSN Column — No Encryption at Rest

**Status:** Deferred — Pre-Production Requirement
**Logged:** 2026-07-24
**Component:** `credentials.ssn` (PostgreSQL, plain TEXT column)

**Current state:** SSN is stored as plaintext, protected only by standard
database access controls and RLS tenant isolation. No column-level or
application-level encryption is applied.

**Condition for continued deferral:** Synthetic/demo data only. This
column must never hold a real SSN until the item below is resolved.

**Pre-production requirement:** Implement AES-256-GCM application-level
encryption for the SSN column before any real provider data is entered.

**Resolution checklist (when picked up):**
- [ ] Encrypt on write, decrypt only for Tier 4+ reads
- [ ] Key management strategy (KMS-backed, not hardcoded)
- [ ] Migration to encrypt any existing plaintext rows
- [ ] Confirm masked responses (Tier 3) never trigger decryption
