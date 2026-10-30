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

The remaining 10 findings are low-risk transitive advisories: `deepmerge`
through both Jest 29 and SendGrid 8, the associated Jest packages, and the
SendGrid client/helpers chain. The available automated alternatives require an unreviewed
major downgrade of Jest/ts-jest or a downgrade of SendGrid to 6.5.2, so those
changes are intentionally deferred.

**Follow-up due:** 2026-11-30 — re-run `npm audit`, review patched SendGrid
and Jest-compatible releases, and remove the override if upstream dependency
ranges make it unnecessary. Do not enter real provider data until the open
encryption and runtime-role findings in this register are resolved.

**Validated at this revision — October 30, 2026 (evening).** After the desktop
environment was repaired (the C: volume had been full, and registry requests
were stalling on IPv6 resolution), a clean `npm ci --ignore-scripts` completed
with 554 packages and no errors. The API Jest suite passed 78 tests with the
seven opt-in cases skipped (`2026-10-30T23:18:16Z`), the disposable PostgreSQL
fixture passed all seven cases and was dropped (`2026-10-30T23:19:47Z`), and the
Gradle build reported `BUILD SUCCESSFUL`. The Android tasks were `UP-TO-DATE`,
so those 14-case-per-variant results are cached 00:58 outputs rather than a
fresh execution; that distinction is recorded in the evidence summary and the
hosted Android job re-executes them from a clean checkout.

When regenerated, [CONTROL-TEST-RESULTS.json](evidence/CONTROL-TEST-RESULTS.json)
matched **31 of 31** `source_sha256` entries, including the new
`.github/dependabot.yml`. `npm audit` on the installed tree confirmed the
remediation figure of 10 remaining low advisories and no moderate, high, or
critical findings.

---

## Duplicate workspace lockfile — `apps/api/package-lock.json`

**Status:** Open — confirmed October 30, 2026.
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

**Resolution:** Delete the nested lockfile and repoint `install:all` at the
workspace root, then confirm `npm ci` from the repository root — the only
installation path CI uses. Verify no workflow or script references the nested
file before removal. Target: before the next dependency review cycle.

**Follow-up due:** 2026-11-30.

---

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
