---
applyTo: "**"
---

# Clinical Compliance Suite — Security & Scope Baseline

These rules apply to every file in this workspace. They are non-negotiable for the beta.

## Encryption

- Data at rest: **AES-256** for all stored data, credentials, and documents.
- Data in transit: **TLS 1.3 minimum** for all connections. No fallback to TLS 1.2.
- Document storage: **SSE-KMS with Customer Managed Keys** (AWS S3 or Azure Blob).

## Authentication & Authorization

- **MFA is mandatory** for every user. Implement TOTP (RFC 6238) or hardware key only.
- **SMS-based MFA is prohibited** — do not scaffold, stub, or reference it.
- **RBAC is enforced at the API layer** on every endpoint. Recognized roles: `org_admin`, `compliance_lead`, `operations_lead`, `viewer`.
- Apply the **Minimum Necessary Standard** — restrict data visibility to the minimum role scope required.

## Audit Logging

- Every create, read, update, or delete of PHI or credentials **must emit an audit event**.
- Audit events must capture: `user_id`, `timestamp` (ISO 8601 UTC), `action_type`, `resource_id`.
- The audit log is **append-only and immutable**. No delete or update operations on audit records.
- Minimum retention: **6 years**.

## PHI Handling

- Never include PHI in email bodies, log messages, error responses, or URLs.
- Emails use encrypted transport only: S/MIME, PGP, or a HIPAA-compliant relay.
- Flag any function parameter, return value, or data structure that carries PHI with a comment: `// PHI`.

## Regulatory Frameworks

- All architecture and data flow decisions must satisfy **HIPAA** and **42 CFR Part 2**.
- If a design creates tension between the two, surface it as a comment: `// COMPLIANCE CONFLICT: <description>` and do not silently resolve it.

## Beta Scope Guard

Do not add code, imports, stubs, TODOs, or feature flags for:

- SMS alerts or SMS MFA
- Wound care checklists or image workflows
- EHR integrations (Epic, Cerner, HL7, FHIR)
- Advanced analytics or reporting
- Billing automation
- Research portals or data anonymization

If a requirement touches these areas, add a comment: `// OUT OF SCOPE: post-beta backlog` and stop.
