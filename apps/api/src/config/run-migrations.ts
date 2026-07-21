/**
 * Migration runner for the MAT/MOUD Clinical Compliance Suite.
 *
 * Executes `init-audit-table.sql` against the database configured
 * via the `DATABASE_URL` environment variable.
 *
 * Usage:
 *   npx ts-node src/config/run-migrations.ts
 *
 * This script uses the existing application pool so it works seamlessly
 * with the connection string and TLS configuration already in place.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { Pool } from 'pg';
import * as fs from 'fs';

// Explicitly load the .env file from apps/api/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function runMigrations(): Promise<void> {
  const sqlPath = path.resolve(__dirname, 'init-audit-table.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  console.log('[MIGRATIONS] Starting...');
  console.log(`[MIGRATIONS] Executing ${path.basename(sqlPath)}`);

  const client = await pool.connect();

  try {
    await client.query(sql);
    console.log('[MIGRATIONS] ✅ All migrations completed successfully.');
  } catch (err) {
    console.error('[MIGRATIONS] ❌ Migration failed:', (err as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();

