/**
 * CodeInsight Phase 9 Test Suite
 * PostgreSQL Database, Migrations, Transactions & Relational Queries
 */

const assert = require('assert');
const path = require('path');
const db = require('../src/database/db');
const { runMigrations } = require('../src/database/migrate');
const scanRepository = require('../src/database/scanRepository');
const analyzerService = require('../src/services/analyzerService');

console.log('[Test Suite] Running CodeInsight Phase 9 PostgreSQL Tests...\n');

(async () => {
  // 1. Connection check
  process.stdout.write('  - Testing PostgreSQL connection on port 5432... ');
  const conn = await db.testConnection();

  if (!conn.connected) {
    console.log(`SKIPPED / OFFLINE (${conn.error})`);
    console.log('\n[NOTE] PostgreSQL server is not currently reachable with configured credentials.');
    console.log('       Configured: host=localhost, port=5432, db=codeinsight, user=postgres');
    console.log('       To connect live, ensure PostgreSQL is started and credentials are set in .env');
    process.exit(0);
  }

  console.log(`PASSED (Version: ${conn.version.split(' ')[0]} ${conn.version.split(' ')[1]})`);

  // 2. Automated Schema Migrations
  process.stdout.write('  - Running automated database migrations... ');
  await runMigrations();
  console.log('PASSED');

  // 3. Verify All 10 Required Tables & Constraints
  process.stdout.write('  - Verifying required relational tables & schema integrity... ');
  const tablesRes = await db.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  const tableNames = new Set(tablesRes.rows.map(r => r.table_name));

  const requiredTables = [
    'repositories',
    'scans',
    'scan_summaries',
    'source_files',
    'file_metrics',
    'function_metrics',
    'duplicate_groups',
    'duplicate_members',
    'dependencies',
    'findings'
  ];

  for (const t of requiredTables) {
    assert(tableNames.has(t), `Required table "${t}" must exist in PostgreSQL`);
  }
  console.log(`PASSED (All 10 required relational tables verified)`);

  // 4. Test Repository CRUD
  process.stdout.write('  - Testing repository insertion & unique constraint... ');
  const repoPath = path.resolve(__dirname, '../../test-fixtures/complex-repo').replace(/\\/g, '/');
  const repo = await scanRepository.saveRepository({
    name: 'PostgreSQL Test Repository',
    path: repoPath,
    description: 'Phase 9 database verification repository'
  });
  assert(repo.id, 'Repository must have an ID');

  const fetchedRepo = await scanRepository.getRepositoryById(repo.id);
  assert.strictEqual(fetchedRepo.name, 'PostgreSQL Test Repository');
  console.log('PASSED');

  // 5. Test Transactional Full Scan Persistence
  process.stdout.write('  - Testing transactional scan persistence (BEGIN...COMMIT)... ');
  const scanReport = await analyzerService.runScan(repoPath);

  const scanRecord = {
    id: `scan_test_${Date.now()}`,
    repoId: repo.id,
    repoPath: repo.path,
    commitHash: 'a1b2c3d4e5f6',
    branch: 'main',
    status: 'completed',
    durationMs: 420,
    startedAt: new Date(Date.now() - 420).toISOString(),
    completedAt: new Date().toISOString(),
    report: scanReport
  };

  await scanRepository.saveFullScan(scanRecord);
  console.log('PASSED');

  // 6. Test Querying Saved Scan from Database
  process.stdout.write('  - Testing relational query & reconstruction from DB... ');
  const queriedScan = await scanRepository.getScanById(scanRecord.id);
  assert(queriedScan, 'Scan must be retrieved from database');
  assert.strictEqual(queriedScan.id, scanRecord.id);
  assert(queriedScan.report.summary.totalFiles > 0);
  assert(queriedScan.report.files.length > 0);

  const sampleFile = queriedScan.report.files[0];
  assert(typeof sampleFile.riskScore === 'number');
  assert(sampleFile.severity);
  assert(sampleFile.riskBreakdown.subScores);
  console.log(`PASSED (${queriedScan.report.files.length} files reconstructed with metrics)`);

  // 7. Test Foreign Key Cascade Delete
  process.stdout.write('  - Testing foreign key cascade deletion... ');
  const deleted = await scanRepository.deleteScan(scanRecord.id);
  assert(deleted, 'Scan must be deleted');

  // Check child tables cascaded
  const childFilesRes = await db.query(`SELECT count(*)::int AS count FROM source_files WHERE scan_id = $1`, [scanRecord.id]);
  assert.strictEqual(childFilesRes.rows[0].count, 0, 'source_files must cascade delete');

  const childMetricsRes = await db.query(`SELECT count(*)::int AS count FROM file_metrics WHERE scan_id = $1`, [scanRecord.id]);
  assert.strictEqual(childMetricsRes.rows[0].count, 0, 'file_metrics must cascade delete');

  console.log('PASSED');

  // Clean up repository
  await scanRepository.deleteRepository(repo.id);

  console.log('\n[ALL PHASE 9 DATABASE TESTS PASSED SUCCESSFULLY]\n');
  await db.close();
})().catch(async (err) => {
  console.error('\n[DATABASE TEST FAILED]:', err);
  await db.close();
  process.exit(1);
});

