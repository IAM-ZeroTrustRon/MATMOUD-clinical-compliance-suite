-- =============================================================================
-- MAT/MOUD Clinical Compliance Suite
-- HIPAA-compliant immutable audit_events table
-- =============================================================================
--
-- Run this migration against your target database once before starting the API.
--
-- Usage (Node.js):
--   npx ts-node src/config/run-migrations.ts
--
-- Usage (direct psql):
--   psql -d matmoud -f src/config/init-audit-table.sql
--
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_events (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT        NOT NULL,
  tenant_id    TEXT,
  action_type  TEXT        NOT NULL,
  resource_id  TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address   INET,
  http_status  SMALLINT
);

-- Revoke all mutating privileges from the writer role, then grant strictly INSERT
REVOKE ALL PRIVILEGES ON audit_events FROM matmoud_writer;
GRANT INSERT ON audit_events TO matmoud_writer;
GRANT USAGE, SELECT ON SEQUENCE audit_events_id_seq TO matmoud_writer;

