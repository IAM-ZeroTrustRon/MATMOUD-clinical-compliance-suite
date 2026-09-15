-- =============================================================================
-- MAT/MOUD Clinical Compliance Suite
-- CEU tracking and issuer reference tables
-- =============================================================================
--
-- Run this migration after init-credentials-table.sql against your target DB.
-- Safe to re-run (idempotent): every object is created with IF NOT EXISTS,
-- DROP POLICY IF EXISTS, or CREATE OR REPLACE. This guards against partial
-- manual application and makes the migrations runner safe to re-invoke.
--
-- Creates:
--   1. credential_issuers   – tenant-scoped reference table of CEU/education
--                             providers (source of truth for issuer identity).
--   2. credential_ceus      – per-credential CEU records with a verification
--                             audit trail (submitted_by/at, verified_by/at,
--                             verification_notes, status workflow).
--   3. credential_compliance_status(UUID) – SECURITY INVOKER helper that
--                             computes a credential's compliance posture,
--                             combining license expiry/revocation with CEU
--                             verification standing.
--
-- Security posture:
--   - Both tables keep `tenant_id TEXT` and enable Row Level Security using
--     the app.current_tenant_id session variable - exactly the session setup
--     produced by db.ts's getClientForTenant() / tenant.middleware.ts.
--   - tenant_id must always be populated from current_setting(...), never from
--     client input (follows the pattern in credentials.routes.ts).
--   - The helper function is declared SECURITY INVOKER so its inner queries run
--     under the CALLER's role and RLS context - no privilege escalation vector,
--     and it returns NULL for credentials invisible to the caller (no existence
--     leak).
--   - matmoud_writer receives only the mutating privileges it needs.
--
-- Usage (Node.js):
--   npx ts-node src/config/run-migrations.ts
-- =============================================================================

BEGIN;

-- uuid_generate_v4() is used by both tables (see init-credentials-table.sql)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. Credential issuers (reference data)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credential_issuers (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id               TEXT        NOT NULL,

  -- Issuer identity
  name                    TEXT        NOT NULL,                -- e.g. "ANCC"
  website                 TEXT,
  verification_contact    TEXT,                                -- preferred verification channel
  notes                   TEXT,

  is_active               BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- No duplicate issuers within the same tenant
  CONSTRAINT uq_issuer_name_per_tenant UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_credential_issuers_tenant_id
  ON credential_issuers (tenant_id);

-- Tenant isolation — RLS enforces that users can only see issuers belonging
-- to their own tenant (set via app.current_tenant_id)
ALTER TABLE credential_issuers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON credential_issuers;
CREATE POLICY tenant_isolation ON credential_issuers
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- -----------------------------------------------------------------------------
-- 2. Credential CEUs (per-credential record with verification audit trail)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credential_ceus (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id               TEXT        NOT NULL,

  credential_id           UUID        NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
  issuer_id               UUID        REFERENCES credential_issuers(id) ON DELETE SET NULL,

  -- Course / certificate details
  course_title            TEXT        NOT NULL,
  course_date             DATE        NOT NULL,
  credits                 NUMERIC(6,2) NOT NULL CHECK (credits > 0),
  certificate_key         TEXT,                -- S3 object key (opaque - no PHI in key names)

  -- Verification workflow status
  status                  TEXT        NOT NULL DEFAULT 'unverified'
                            CHECK (status IN ('unverified', 'verified', 'rejected')),

  -- Verification audit trail
  submitted_by            TEXT,                -- user_id of the submitter
  submitted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_by             TEXT,                -- user_id of the verifier
  verified_at             TIMESTAMPTZ,
  verification_notes      TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate submissions of the same course for one credential
  CONSTRAINT uq_credential_course UNIQUE (tenant_id, credential_id, course_title, course_date)
);

CREATE INDEX IF NOT EXISTS idx_credential_ceus_tenant_id
  ON credential_ceus (tenant_id);
CREATE INDEX IF NOT EXISTS idx_credential_ceus_credential_id
  ON credential_ceus (credential_id);
CREATE INDEX IF NOT EXISTS idx_credential_ceus_status
  ON credential_ceus (tenant_id, status);

-- Tenant isolation — same RLS pattern as credential_issuers
ALTER TABLE credential_ceus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON credential_ceus;
CREATE POLICY tenant_isolation ON credential_ceus
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- -----------------------------------------------------------------------------
-- 3. Compliance status helper (SECURITY INVOKER)
-- -----------------------------------------------------------------------------
--
-- Returns the compliance posture for a credential:
--   NULL          – credential not visible to the caller under RLS (no leak)
--   'revoked'     – license/credential revoked
--   'expired'     – license date passed (expiration_date < today)
--   'ceu-deficient' – no VERIFIED CEU recorded within the trailing 24 months
--   'compliant'   – unexpired + at least one verified CEU in the window
--
-- ASSUMPTION: the trailing window (24 months) is a policy default; adjust it to
-- your state/board requirement. The CEU threshold is deliberately kept simple
-- ("any verified CEU") rather than per-license-type hour quotas, so this helper
-- does not invent business rules the schema cannot enforce yet.
--
-- SECURITY INVOKER: all inner queries execute under the caller's role and RLS
-- context, so a caller can only read the credentials/CEUs their tenant can see.
-- A SECURITY DEFINER variant would be a privilege escalation vector. Only
-- callers granted EXECUTE can use it (grant at the bottom of this file).
CREATE OR REPLACE FUNCTION credential_compliance_status(p_credential_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM credentials c
      WHERE c.id = p_credential_id
    ) THEN NULL
    WHEN (SELECT status FROM credentials c WHERE c.id = p_credential_id) = 'revoked'
      THEN 'revoked'
    WHEN (SELECT expiration_date FROM credentials c WHERE c.id = p_credential_id) < CURRENT_DATE
      THEN 'expired'
    WHEN NOT EXISTS (
      SELECT 1 FROM credential_ceus ce
      WHERE ce.credential_id = p_credential_id
        AND ce.status = 'verified'
        AND ce.course_date >= CURRENT_DATE - INTERVAL '24 months'
    ) THEN 'ceu-deficient'
    ELSE 'compliant'
  END
$$;

-- -----------------------------------------------------------------------------
-- 4. Privileges (matmoud_writer)
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON credential_ceus TO matmoud_writer;
GRANT SELECT, INSERT, UPDATE ON credential_issuers TO matmoud_writer;
GRANT EXECUTE ON FUNCTION credential_compliance_status(UUID) TO matmoud_writer;

COMMIT;
