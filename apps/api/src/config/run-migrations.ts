import 'dotenv/config';
import pool from './db';
import * as path from 'path';
import * as fs from 'fs';

const MIGRATION_FILES = [
  'init-audit-table.sql',
  'init-credentials-table.sql',
  'init-last-alerted-column.sql',
];

/**
 * Ensure the schema_migrations tracking table exists.
 * This table records every migration that has been applied, making
 * reruns safe (idempotent) and providing an honest audit trail.
 */
async function ensureTrackingTable(client: import('pg').PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT   NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Check whether a specific migration has already been applied.
 */
async function isApplied(client: import('pg').PoolClient, filename: string): Promise<boolean> {
  const { rows } = await client.query(
    'SELECT 1 FROM schema_migrations WHERE filename = $1',
    [filename]
  );
  return rows.length > 0;
}

/**
 * Record a migration as applied.
 */
async function markApplied(client: import('pg').PoolClient, filename: string): Promise<void> {
  await client.query(
    'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
    [filename]
  );
}

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('Running database migrations...');

    // Ensure the tracking table exists before processing any migration
    await ensureTrackingTable(client);

    for (const file of MIGRATION_FILES) {
      const sqlPath = path.join(__dirname, file);

      // Fail loudly if a migration file is missing — silent skip is unacceptable
      // for a compliance product.
      if (!fs.existsSync(sqlPath)) {
        throw new Error(
          `[MIGRATION] REQUIRED FILE NOT FOUND: ${file}\n` +
          `  Expected at: ${sqlPath}\n` +
          '  Ensure the file exists before running migrations.'
        );
      }

      // Skip if already applied (idempotent rerun)
      if (await isApplied(client, file)) {
        console.log(`[MIGRATION] ${file} already applied — skipping.`);
        continue;
      }

      const sql = fs.readFileSync(sqlPath, 'utf8');
      console.log(`[MIGRATION] Applying ${file}...`);
      await client.query(sql);
      await markApplied(client, file);
      console.log(`[MIGRATION] ${file} applied successfully.`);
    }

    console.log('All migrations completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
