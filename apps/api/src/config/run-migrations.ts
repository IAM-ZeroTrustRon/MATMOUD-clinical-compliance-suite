import 'dotenv/config';
import pool from './db';
import * as path from 'path';
import * as fs from 'fs';

const MIGRATION_FILES = [
  'init-audit-table.sql',
  'init-credentials-table.sql',
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('Running database migrations...');

    for (const file of MIGRATION_FILES) {
      const sqlPath = path.join(__dirname, file);
      if (!fs.existsSync(sqlPath)) {
        console.warn(`[MIGRATION] File not found, skipping: ${file}`);
        continue;
      }
      const sql = fs.readFileSync(sqlPath, 'utf8');
      console.log(`[MIGRATION] Applying ${file}...`);
      await client.query(sql);
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
