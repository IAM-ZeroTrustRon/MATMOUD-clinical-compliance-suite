# Security Debt Log

Tracked, deliberate deferrals — not oversights. Each entry requires
resolution before real (non-synthetic) data enters the system.

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