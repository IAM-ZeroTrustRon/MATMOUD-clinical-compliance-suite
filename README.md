# MAT/MOUD Clinical Compliance Suite

[Portfolio index](https://github.com/IAM-ZeroTrustRon/GRC-IAM-Portfolio) · **Repository role:** Application source; synthetic-data prototype.

[Security assessment](https://github.com/IAM-ZeroTrustRon/MOUD-compliance-SecAudit) · [Architecture case study](https://github.com/IAM-ZeroTrustRon/Clinical_Compliance_Hub)

## Control assurance evidence

[Automated validation](docs/CI-VALIDATION.md) defines API/web, PostgreSQL, and
Android checks on pushes and pull requests. `main` requires these three checks with admin enforcement and zero required
approvals. Consult the current protection settings and Actions run for operating evidence.

See [independent workspace layout](docs/WORKSPACE-LAYOUT.md) for the application,
audit, and case-study repository locations and recovery notes.

[October 29 backend hardening](docs/HARDENING-2026-10-29.md) adds tenant-scoped
upload persistence, a `has_document` list contract, fail-closed read audits,
safe error/mail boundaries, and regression tests. Current results are 78 default
API tests plus seven separately executed real-PostgreSQL tests, with 14 JVM
tests per Android build variant. The earlier 35-test run is superseded.

[Compliance controls: description, test, and evidence](docs/CONTROL-EVIDENCE.md)
provides one paragraph per control, with implementation references, the test or
acceptance criterion, its demonstrated scope, and known gaps. The
[sanitized test summary](docs/evidence/CONTROL-TEST-RESULTS.json) records the
dated API regression runs without application records or raw logs.

## Current development handoff

Read [the Gemini project handoff](docs/GEMINI-HANDOFF.md) for the consolidated
architecture, Android progress, historical test evidence, separate CEU branch,
chat-only prototype work, and remaining integration tasks. Updated October 20,
2026. For Android setup, see [the module guide](apps/mobile-android/CLAUDE.md).
See [the October 20 execution report](docs/EXECUTION-STATUS-2026-10-20.md) for
historical validation results and database/API review findings.
Statements below about readiness describe project intent and earlier milestones;
use the handoff and security debt log for current limitations.

A multi-tenant credential and compliance management prototype for MAT/MOUD clinics,
designed against **HIPAA** and **42 CFR Part 2** requirements. Implemented controls,
test evidence, and unresolved gaps are documented in the control register;
public availability does not establish production readiness or regulatory compliance.

---

**Publication status:** Public source / beta reference architecture. See [security debt](docs/SECURITY_DEBT.md) before considering real-data use.

## Beta Scope

This repository contains a **synthetic-data beta prototype** with a focused core flow.
Real-data use remains gated by the open security debt and deployment validation:

> **Login → Add Credential → Upload Document → Set Expiration → Receive Alert → View Compliance Status**

| Module | Status | Notes |
|---|---|---|
| Login & Org Setup (Auth0 + MFA) | ✅ Code complete | Frontend + Auth0 wiring verified; role-based access badge with fail-closed fallback |
| Credential Dashboard | ✅ Code complete | Frontend table with compliance badges, PHI reveal cells, add-credential form, and summary strip; backend routes verified |
| Document Upload (S3 SSE-KMS) | ✅ Code complete | `POST /:id/upload` with SSE-KMS, Multer, MIME validation; `GET /:id/document` signed URL retrieval; DocumentCell component handles upload + view |
| Email Alerts Workflow | 🟡 Backend complete, scheduler added | `POST /alerts/run` with SendGrid integration, PHI validation, audit logging. Daily cron scheduler wired in. |
| Audit Trail | ✅ Code complete | RLS-scoped, parameterized, Tier 4+ gated, pagination verified |

> **Out of scope for beta:** SMS alerts, wound care workflows, EHR integrations (Epic/Cerner/HL7/FHIR), advanced analytics, billing automation, research portals.

---

## Repository Structure

```
clinical-compliance-suite/
├── apps/
│   ├── web/                          # React web client
│   ├── mobile-android/               # Kotlin Android companion
│   └── api/                          # Node.js Express API
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── server.ts             # Express bootstrap + middleware wiring
│           ├── config/
│           │   ├── db.ts             # PostgreSQL pool + RLS client factory
│           │   └── s3.ts             # S3 client with SSE-KMS support
│           ├── middleware/
│           │   ├── index.ts          # Barrel — middleware chain order
│           │   ├── auth.middleware.ts     # Auth0 JWT validation + MFA enforcement
│           │   ├── tenant.middleware.ts   # PostgreSQL RLS context (multi-tenancy)
│           │   ├── audit.middleware.ts    # Audit event writer; assurance gaps tracked
│           │   └── rbac.ts               # Role/tier definitions + access guards
│           ├── routes/
│           │   ├── credentials.routes.ts  # Dashboard + document upload
│           │   └── alerts.routes.ts       # Expiration → SendGrid workflow
│           ├── services/
│           │   ├── expiration.service.ts  # Expiring credential query
│           │   └── email.service.ts       # SendGrid (no PHI in body)
│           ├── utils/
│           │   └── validator.ts           # MIME type validation
│           └── types/
│               └── express.d.ts      # Express Request type extensions
├── docs/                            # Controls, evidence and security debt
├── package-lock.json                 # Root npm workspace lockfile
├── .env.example
└── .github/
    ├── workflows/                   # Required validation checks
    ├── agents/
    │   └── clinical-compliance-beta.agent.md   # VS Code Copilot agent
    └── instructions/
        └── clinical-compliance-security.instructions.md  # Always-on security rules
```

---

## Security Architecture

### Middleware Chain (strict execution order)

```
Request
  │
  ▼
auth.middleware.ts        ← 1. Validate Auth0 RS256 JWT + enforce TOTP/FIDO2 MFA
  │
  ▼
tenant.middleware.ts       ← 2. Set PostgreSQL RLS: SET LOCAL app.current_tenant_id
  │
  ▼
audit.middleware.ts        ← 3. Register audit attempt for 2xx mutations
  │
  ▼
[requireRole / requireMinTier]   ← 4. Per-route RBAC gate
  │
  ▼
Route Handler
```

Protected routes apply authentication, tenant context and authorization before handling data. Credential reads await their audit writes and fail closed on error. General mutation audit logging runs after response completion and is not atomic with the business write; see the control register for this remaining gap.

### Authentication (`auth.middleware.ts`)

- Validates **RS256-signed JWTs** via Auth0's JWKS endpoint (cached, rate-limited).
- Enforces **MFA**: accepts only the configured `mfa`, `totp`, `fido`, or `fido2` markers; missing or password-only assertions fail closed.
- **SMS is never a valid `amr` value** — tokens authenticated via SMS are rejected with `401`.
- Populates `req.user` with identity claims only. No PHI enters this object.

### Multi-Tenant Data Isolation (`tenant.middleware.ts`)

- Acquires a **dedicated pool connection** per request (not a shared connection).
- Opens a transaction and calls `set_config('app.current_tenant_id', tenantId, true)` — the `true` argument scopes the value to the current transaction only, preventing bleed across connections.
- Route handlers **must** use `req.dbClient` for all queries. PostgreSQL RLS limits data access under a correctly restricted runtime role. Superusers and BYPASSRLS roles bypass those policies; runtime-role remediation remains tracked.
- Tenant ID is validated against `/^[a-zA-Z0-9_-]{1,64}$/` before use before it is used as a query parameter.

### RBAC Access Tiers (`rbac.ts`)

| Tier | Roles | PHI Access |
|---|---|---|
| **Tier 3 — Limited Support** | `customer_support`, `implementation`, `viewer` | Masked by default |
| **Tier 4 — Clinical / Backend** | `org_admin`, `clinic_admin`, `compliance_lead`, `operations_lead`, `backend_engineer` | Full within tenant |
| **Tier 5 — Privileged Admin** | `db_admin`, `security_devops` | Tenant-scoped privileged access; out-of-band dual approval remains an assurance gap |

```typescript
// Exact-role gate
router.get('/credentials', requireRole(ROLES.COMPLIANCE_LEAD, ROLES.ORG_ADMIN), handler);

// Tier-level gate
router.delete('/org/:id', requireMinTier(TIER.PRIVILEGED_ADMIN), handler);

// PHI masking for Tier 3 responses
const safe = maskPhiFields(req, record, ['ssn', 'dob', 'license_number']); // PHI
```

### Audit Logging (`audit.middleware.ts`)

- Attempts an audit INSERT after successful (`2xx`) mutating responses; delivery is not atomic with the business transaction.
- Captures: `user_id`, `tenant_id`, `action_type`, `resource_id`, `occurred_at` (ISO 8601 UTC), `ip_address`, `http_status`.
- Migration grants target an **INSERT-only application role**; the configured runtime role and privileged tamper protections must be checked separately.
- PHI READ access must be logged from route handlers using `auditPhiRead()`.
- **Project retention objective: 6 years.** Archive/retention effectiveness has not been demonstrated.

---

## Required Environment Variables

```bash
# Copy .env.example to .env and populate before starting the API
cp .env.example .env
```

| Variable | Description |
|---|---|
| `AUTH0_DOMAIN` | Your Auth0 tenant domain (e.g. `your-tenant.auth0.com`) |
| `AUTH0_AUDIENCE` | Auth0 API audience (e.g. `https://api.your-domain.com`) |
| `AUTH0_NAMESPACE` | Namespace for custom claims (e.g. `https://app.your-domain.com`) |
| `DATABASE_URL` | PostgreSQL connection string |

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ with Row Level Security enabled
- An Auth0 tenant with a configured API and custom rules/actions that set `tenant_id` and `roles` as namespaced claims.

### Install Dependencies

```bash
# From the repository root; use the committed workspace lockfile.
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test --workspace=apps/api -- --runInBand
```

### Key Runtime Dependencies

| Package | Purpose |
|---|---|
| `jsonwebtoken` | JWT decode and verification |
| `jwks-rsa` | Fetch and cache Auth0 JWKS signing keys |
| `pg` | PostgreSQL client for RLS-scoped queries |

### PostgreSQL Setup

The `audit_events` table requires an INSERT-only grant for the application role:

```sql
-- Create audit_events table (append-only)
CREATE TABLE audit_events (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT        NOT NULL,
  tenant_id    TEXT,
  action_type  TEXT        NOT NULL,
  resource_id  TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address   INET,
  http_status  SMALLINT
);

-- Revoke all mutating privileges from the app role
REVOKE UPDATE, DELETE ON audit_events FROM app_role;

-- Enable RLS on all PHI-bearing tables
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY tenant_isolation ON credentials
  USING (tenant_id = current_setting('app.current_tenant_id', true));
```

### Auth0 Configuration

Add a Post-Login Action that injects `tenant_id` and `roles` into the token as namespaced custom claims:

```javascript
// Auth0 Action — add to Login flow
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://app.your-domain.com';
  api.accessToken.setCustomClaim(`${namespace}/tenant_id`, event.user.app_metadata?.tenant_id);
  api.accessToken.setCustomClaim(`${namespace}/roles`, event.authorization?.roles ?? []);
};
```

---

## Control objectives and assurance limits

| Objective | Implementation or required evidence |
|---|---|
| Document encryption | S3 upload requests specify SSE-KMS; deployed customer-managed key policy needs separate verification |
| Transport protection | TLS requirements are project objectives; deployed termination and service connections require evidence |
| Access control | API role/tier gates and tenant-scoped data access; see the tested matrix and remaining gaps |
| Auditability | Read-audit delivery gates and mutation audit attempts; immutability, retention and atomicity are separate assurance requirements |
| Authentication | Project-approved MFA claim checks; real identity-provider flows require integration evidence |
| Regulatory alignment | Design objectives mapped to applicable HIPAA/Part 2 concerns; no certification or production assurance is asserted |

Any design decision that creates tension between HIPAA and 42 CFR Part 2 is surfaced in source code as `// COMPLIANCE CONFLICT: <description>`.

---

## VS Code Copilot Agent

This repo ships with a custom VS Code Copilot agent (`Clinical Compliance Beta Builder`) in `.github/agents/`. It supplies security and scope guidance during development; instructions alone do not enforce or prove runtime controls.

```
@clinical-compliance-beta implement the document upload endpoint with SSE-KMS
@clinical-compliance-beta scaffold the credential expiration query
@clinical-compliance-beta build the SendGrid alert service — no PHI in body
```

---

## Contributing

This source repository is public; the application remains a beta reference implementation. Public visibility does not establish production readiness or regulatory compliance. All contributors must:

1. Complete security onboarding before committing any code.
2. Never commit `.env` or any file containing credentials, keys, or PHI.
3. Run `npm audit` before every PR.
4. Tag any data structure carrying PHI with a `// PHI` comment.
