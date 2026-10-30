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
