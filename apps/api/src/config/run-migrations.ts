import 'dotenv/config';
import pool from './db';
import * as path from 'path';
import * as fs from 'fs';

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('Running database migrations...');
    const sqlPath = path.join(__dirname, 'init-audit-table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await client.query(sql);
    console.log('Migrations completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();