-- =============================================================================
-- MAT/MOUD Clinical Compliance Suite
-- Add last_alerted_at column for alert deduplication
-- =============================================================================
--
-- Prevents duplicate alerts: after an alert is sent, last_alerted_at is set
-- to NOW(). The scheduler queries only credentials WHERE last_alerted_at IS NULL,
-- so each credential receives exactly one alert per expiration window.
--
-- KNOWN GAP: When a credential is renewed (expiration_date updated),
-- last_alerted_at must be reset to NULL to allow a new alert cycle.
-- This reset should be added to the renewal/update endpoint when it's built.
-- =============================================================================

ALTER TABLE credentials
  ADD COLUMN IF NOT EXISTS last_alerted_at TIMESTAMPTZ DEFAULT NULL;

-- Index for the scheduler's dedup query
CREATE INDEX IF NOT EXISTS idx_credentials_last_alerted
  ON credentials (tenant_id, expiration_date)
  WHERE status != 'revoked' AND last_alerted_at IS NULL;