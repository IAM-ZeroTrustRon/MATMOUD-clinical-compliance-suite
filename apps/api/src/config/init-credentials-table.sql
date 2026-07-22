-- =============================================================================
-- MAT/MOUD Clinical Compliance Suite
-- Credentials table — stores provider/staff credentials with PHI
-- =============================================================================
--
-- Run this migration after init-audit-table.sql against your target database.
--
-- Usage:
--   npx ts-node src/config/run-migrations.ts
-- (the migrations runner will apply all *.sql files in src/config/)
--
-- =============================================================================

-- Enable uuid-ossp extension if not already available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS credentials (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        TEXT        NOT NULL,

  -- Core credential fields
  patient_name     TEXT        NOT NULL,          -- PHI
  license_type     TEXT,                           -- e.g. "RN", "LPN", "MD", "NP", "PA"
  license_number   TEXT,                           -- PHI — state-issued license number
  license_state    TEXT,                           -- e.g. "NY", "CA", "TX"
  npi              TEXT,                           -- National Provider Identifier

  -- Personal identifiable information (PHI)
  dob              DATE,                           -- PHI — date of birth
  ssn              TEXT,                           -- PHI — social security number (masked in Tier 3)

  -- Contact information
  phone            TEXT,                           -- PHI
  email            TEXT,                           -- PHI
  address          TEXT,                           -- PHI

  -- Credential lifecycle
  expiration_date  DATE        NOT NULL DEFAULT (NOW() + INTERVAL '1 year'),
  status           TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'expiring', 'expired', 'revoked')),


  -- File / document references (opaque IDs, no PHI in key names)
  document_key     TEXT,                           -- S3 object key for uploaded document

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate license numbers within the same tenant
  CONSTRAINT uq_tenant_license UNIQUE (tenant_id, license_number)
);

-- Index for tenant-scoped queries (RLS)
CREATE INDEX IF NOT EXISTS idx_credentials_tenant_id ON credentials (tenant_id);

-- Index for expiration alerts
CREATE INDEX IF NOT EXISTS idx_credentials_expiration ON credentials (tenant_id, expiration_date)
  WHERE status != 'revoked';

-- Enable Row Level Security
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if re-running the migration
DROP POLICY IF EXISTS tenant_isolation ON credentials;

-- Tenant isolation policy — RLS enforces that users can only see
-- credentials belonging to their own tenant (set via app.current_tenant_id)
CREATE POLICY tenant_isolation ON credentials
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Grant appropriate privileges to the writer role
GRANT SELECT, INSERT, UPDATE ON credentials TO matmoud_writer;

