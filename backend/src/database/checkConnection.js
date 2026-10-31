/**
 * CodeInsight Database Connection Verifier
 * Quick CLI utility to verify PostgreSQL connectivity, schema, and credentials.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const db = require('./db');

async function checkDatabase() {
  console.log('====================================================');
  console.log('       CodeInsight PostgreSQL Connection Check       ');
  console.log('====================================================');
  console.log(`Configured Host : ${db.config.host}`);
  console.log(`Configured Port : ${db.config.port}`);
  console.log(`Configured DB   : ${db.config.database}`);
  console.log(`Configured User : ${db.config.user}`);
  console.log('----------------------------------------------------');

  const start = Date.now();
  const conn = await db.testConnection();
  const duration = Date.now() - start;

  if (!conn.connected) {
    console.error('❌ Connection Status: FAILED');
    console.error(`Error details       : ${conn.error}`);
    console.log('\n[Troubleshooting Tips]');
    console.log('1. Verify PostgreSQL service is running:');
    console.log('   Get-Service -Name postgresql* (in PowerShell)');
    console.log('2. Verify password in .env matches your PostgreSQL password.');
    console.log('3. Ensure database exists: npm run migrate');
    console.log('====================================================\n');
    process.exit(1);
  }

  console.log('✅ Connection Status: SUCCESS (Connected)');
  console.log(`Latency             : ${duration}ms`);
  console.log(`Database Version    : ${conn.version.split('\n')[0]}`);

  // Query tables count
  try {
    const tableRes = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('----------------------------------------------------');
    console.log(`Schema Tables (${tableRes.rows.length} found):`);
    tableRes.rows.forEach(r => console.log(`  • ${r.table_name}`));

    // Query scan count
    const scanCountRes = await db.query('SELECT COUNT(*)::int AS count FROM scans;');
    const repoCountRes = await db.query('SELECT COUNT(*)::int AS count FROM repositories;');
    console.log('----------------------------------------------------');
    console.log(`Repositories in DB : ${repoCountRes.rows[0].count}`);
    console.log(`Scans in DB        : ${scanCountRes.rows[0].count}`);
  } catch (err) {
    console.warn('Warning querying schema stats:', err.message);
  }

  console.log('====================================================\n');
  await db.close();
  process.exit(0);
}

checkDatabase();

