# MAT/MOUD Clinical Compliance Suite

A HIPAA-compliant, multi-tenant credential and compliance management platform for MAT/MOUD clinics. Built with a security-first architecture that satisfies **HIPAA** and **42 CFR Part 2** from day one.

---

## Beta Scope

This repository contains the **pilot-ready beta** — a single, focused core flow:

> **Login → Add Credential → Upload Document → Set Expiration → Receive Alert → View Compliance Status**

| Module | Status | Notes |
|---|---|---|
| Login & Org Setup (Auth0 + MFA) | ✅ Code complete | Frontend + Auth0 wiring verified |
| Credential Dashboard | ✅ Code complete | Frontend table + backend routes verified |
| Document Upload (S3 SSE-KMS) | 🟡 Backend complete, frontend partial | `POST /:id/upload` exists with SSE-KMS, Multer, MIME validation. Upload UI per row added to dashboard. |
| Email Alerts Workflow | 🟡 Backend complete, scheduler added | `POST /alerts/run` with SendGrid integration, PHI validation, audit logging. Daily cron scheduler wired in. |
| Audit Trail | ✅ Code complete | RLS-scoped, parameterized, Tier 4+ gated, pagination verified |

> **Out of scope for beta:** SMS alerts, wound care workflows, EHR integrations (Epic/Cerner/HL7/FHIR), advanced analytics, billing automation, research portals.

---

## Repository Structure

```
clinical-compliance-suite/
├── apps/
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
│           │   ├── audit.middleware.ts    # HIPAA-compliant immutable audit log
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
├── .env.example
└── .github/
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
audit.middleware.ts        ← 3. Write immutable event to audit_events on 2xx mutations
  │
  ▼
[requireRole / requireMinTier]   ← 4. Per-route RBAC gate
  │
  ▼
Route Handler
```

Every request through a protected route traverses this chain in order. A failure at any stage short-circuits the chain and returns the appropriate HTTP error — no downstream code executes.

### Authentication (`auth.middleware.ts`)

- Validates **RS256-signed JWTs** via Auth0's JWKS endpoint (cached, rate-limited).
- Enforces **MFA**: rejects tokens where `amr` does not include `totp`, `fido`, or `fido2`.
- **SMS is never a valid `amr` value** — tokens authenticated via SMS are rejected with `401`.
- Populates `req.user` with identity claims only. No PHI enters this object.

### Multi-Tenant Data Isolation (`tenant.middleware.ts`)

- Acquires a **dedicated pool connection** per request (not a shared connection).
- Opens a transaction and calls `set_config('app.current_tenant_id', tenantId, true)` — the `true` argument scopes the value to the current transaction only, preventing bleed across connections.
- Route handlers **must** use `req.dbClient` for all queries. PostgreSQL RLS policies will reject any query that lacks a valid tenant context.
- Tenant ID is validated against `/^[a-zA-Z0-9_-]{1,64}$/` before use — no injection path exists.

### RBAC Access Tiers (`rbac.ts`)

| Tier | Roles | PHI Access |
|---|---|---|
| **Tier 3 — Limited Support** | `customer_support`, `implementation`, `viewer` | Masked by default |
| **Tier 4 — Clinical / Backend** | `org_admin`, `clinic_admin`, `compliance_lead`, `operations_lead`, `backend_engineer` | Full within tenant |
| **Tier 5 — Privileged Admin** | `db_admin`, `security_devops` | Full system — requires dual approval |

```typescript
// Exact-role gate
router.get('/credentials', requireRole(ROLES.COMPLIANCE_LEAD, ROLES.ORG_ADMIN), handler);

// Tier-level gate
router.delete('/org/:id', requireMinTier(TIER.PRIVILEGED_ADMIN), handler);

// PHI masking for Tier 3 responses
const safe = maskPhiFields(req, record, ['ssn', 'dob', 'license_number']); // PHI
```

### Audit Logging (`audit.middleware.ts`)

- Writes to `audit_events` on every successful (`2xx`) mutating request.
- Captures: `user_id`, `tenant_id`, `action_type`, `resource_id`, `occurred_at` (ISO 8601 UTC), `ip_address`, `http_status`.
- The table is **INSERT-only** — the app DB role must not hold `UPDATE` or `DELETE` privileges on `audit_events`.
- PHI READ access must be logged from route handlers using `auditPhiRead()`.
- **Minimum retention: 6 years.** Use time-series partitioning — never `DELETE` rows.

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
cd apps/api
npm install
npm install -D @types/jsonwebtoken @types/jwks-rsa
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

## Compliance

| Requirement | Implementation |
|---|---|
| HIPAA — Encryption at Rest | AES-256 via SSE-KMS (S3 / Azure Blob) |
| HIPAA — Encryption in Transit | TLS 1.3 minimum — no TLS 1.2 fallback |
| HIPAA — Access Control | RBAC enforced at API layer on every endpoint |
| HIPAA — Audit Controls | Immutable `audit_events`, 6-year retention |
| HIPAA — MFA | TOTP (RFC 6238) or FIDO2 — SMS prohibited |
| 42 CFR Part 2 | Architecture reviewed per Part 2 requirements |

Any design decision that creates tension between HIPAA and 42 CFR Part 2 is surfaced in source code as `// COMPLIANCE CONFLICT: <description>`.

---

## VS Code Copilot Agent

This repo ships with a custom VS Code Copilot agent (`Clinical Compliance Beta Builder`) in `.github/agents/`. It enforces all security rules and beta scope boundaries during AI-assisted development sessions.

```
@clinical-compliance-beta implement the document upload endpoint with SSE-KMS
@clinical-compliance-beta scaffold the credential expiration query
@clinical-compliance-beta build the SendGrid alert service — no PHI in body
```

---

## Contributing

This is a private beta. All contributors must:

1. Complete security onboarding before committing any code.
2. Never commit `.env` or any file containing credentials, keys, or PHI.
3. Run `npm audit` before every PR.
4. Tag any data structure carrying PHI with a `// PHI` comment.
