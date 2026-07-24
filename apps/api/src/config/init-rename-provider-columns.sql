-- =============================================================================
-- MAT/MOUD Clinical Compliance Suite
-- Rename patient_name → provider_name, make ssn/dob nullable, add document_key
-- =============================================================================
--
-- Run this migration after init-last-alerted-column.sql.
-- Safe to re-run: ALTER COLUMN ... DROP NOT NULL is a no-op if already nullable,
-- and ADD COLUMN IF NOT EXISTS skips if the column already exists.
--
-- =============================================================================

BEGIN;

ALTER TABLE credentials RENAME COLUMN patient_name TO provider_name;
ALTER TABLE credentials ALTER COLUMN ssn DROP NOT NULL;
ALTER TABLE credentials ALTER COLUMN dob DROP NOT NULL;
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS document_key TEXT;

COMMIT;