/**
 * CodeInsight Database Migration Runner
 * Phase 9: Automated Schema Migrations
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'codeinsight'
};

async function ensureDatabaseExists() {
  const adminClient = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'postgres'
  });

  try {
    await adminClient.connect();
    const checkDb = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [config.database]
    );

    if (checkDb.rows.length === 0) {
      console.log(`[Migrations] Database "${config.database}" does not exist. Creating...`);
      await adminClient.query(`CREATE DATABASE "${config.database}"`);
      console.log(`[Migrations] Database "${config.database}" created successfully.`);
    }
  } catch (err) {
    console.warn(`[Migrations] Note: Could not auto-create database (${err.message}). Connecting directly...`);
  } finally {
    try {
      await adminClient.end();
    } catch (_) {}
  }
}

async function runMigrations() {
  await ensureDatabaseExists();

  const client = new Client(config);
  try {
    await client.connect();
    console.log(`[Migrations] Connected to PostgreSQL at ${config.host}:${config.port}/${config.database}`);

    // Create schema_migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Load applied migrations
    const appliedRes = await client.query(`SELECT version FROM schema_migrations`);
    const appliedVersions = new Set(appliedRes.rows.map(r => r.version));

    // Read migration files
    const migrationsDir = path.resolve(__dirname, '../../../database/migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('[Migrations] No migrations directory found.');
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;

    for (const file of files) {
      if (appliedVersions.has(file)) {
        continue;
      }

      console.log(`[Migrations] Applying migration: ${file}...`);
      const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query(
          `INSERT INTO schema_migrations (version) VALUES ($1)`,
          [file]
        );
        await client.query('COMMIT');
        console.log(`[Migrations] Successfully applied: ${file}`);
        appliedCount++;
      } catch (migrationErr) {
        await client.query('ROLLBACK');
        console.error(`[Migrations ERROR] Failed applying ${file}:`, migrationErr.message);
        throw migrationErr;
      }
    }

    console.log(`[Migrations Complete] ${appliedCount} new migration(s) applied. Schema up to date.`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runMigrations().catch(err => {
    console.error('[Migrations Fatal]:', err);
    process.exit(1);
  });
}

module.exports = { runMigrations, ensureDatabaseExists };

