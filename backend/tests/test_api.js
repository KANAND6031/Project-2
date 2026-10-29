/**
 * CodeInsight Phase 8 Test Suite
 * End-to-End REST API Integration Tests
 */

const assert = require('assert');
const path = require('path');
const http = require('http');
const app = require('../src/server');

console.log('[Test Suite] Running CodeInsight Phase 8 REST API Tests...\n');

let server;
let baseUrl;

function request(method, route, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(route, baseUrl);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(url, options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {
          json = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

(async () => {
  // Start server on dynamic port
  await new Promise(resolve => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });

  try {
    // 1. Health check
    {
      process.stdout.write('  - Testing GET /api/health... ');
      const res = await request('GET', '/api/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'healthy');
      console.log('PASSED');
    }

    // 2. Repository Management
    let testRepoId = null;
    {
      process.stdout.write('  - Testing Repository CRUD (/api/repositories)... ');

      // Bad path validation
      const badRes = await request('POST', '/api/repositories', { path: 'nonexistent/invalid/dir' });
      assert.strictEqual(badRes.status, 400);

      // Register valid repository
      const fixturePath = path.resolve(__dirname, '../../test-fixtures/duplication-repo');
      const createRes = await request('POST', '/api/repositories', {
        name: 'API Test Repo',
        path: fixturePath,
        description: 'Test repository for API testing'
      });
      assert([200, 201].includes(createRes.status));
      assert(createRes.data.data.id);
      testRepoId = createRes.data.data.id;

      // List repositories
      const listRes = await request('GET', '/api/repositories');
      assert.strictEqual(listRes.status, 200);
      assert(listRes.data.data.some(r => r.id === testRepoId));

      // Get repository by ID
      const getRes = await request('GET', `/api/repositories/${testRepoId}`);
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.data.data.name, 'API Test Repo');

      console.log('PASSED');
    }

    // 3. Scan Execution (Synchronous & Background)
    let syncScanId = null;
    let asyncScanId = null;
    {
      process.stdout.write('  - Testing Scan Submission (Sync & Async)... ');

      // Synchronous scan
      const syncRes = await request('POST', '/api/scans?sync=true', {
        repoId: testRepoId
      });
      assert.strictEqual(syncRes.status, 200);
      assert(syncRes.data.data.scanId);
      assert.strictEqual(syncRes.data.data.status, 'completed');
      syncScanId = syncRes.data.data.scanId;

      // Background asynchronous scan
      const samplePath = path.resolve(__dirname, '../../test-fixtures/sample-repo');
      const asyncRes = await request('POST', '/api/scans', {
        repoPath: samplePath
      });
      assert.strictEqual(asyncRes.status, 202);
      assert.strictEqual(asyncRes.data.data.status, 'queued');
      asyncScanId = asyncRes.data.data.scanId;

      // Check status of async scan
      const statusRes = await request('GET', `/api/scans/${asyncScanId}/status`);
      assert.strictEqual(statusRes.status, 200);
      assert(['queued', 'running', 'completed'].includes(statusRes.data.data.status));

      console.log('PASSED');
    }

    // 4. Granular Scan Sub-Resources
    {
      process.stdout.write('  - Testing Granular Scan Query Endpoints... ');

      // Summary
      const summaryRes = await request('GET', `/api/scans/${syncScanId}/summary`);
      assert.strictEqual(summaryRes.status, 200);
      assert(summaryRes.data.data.summary.totalFiles > 0);
      assert.strictEqual(summaryRes.data.data.technicalDebt.formula, 'R = 0.45*C + 0.35*D + 0.20*S');

      // Paginated files
      const filesRes = await request('GET', `/api/scans/${syncScanId}/files?limit=2&offset=0`);
      assert.strictEqual(filesRes.status, 200);
      assert.strictEqual(filesRes.data.pagination.limit, 2);
      assert(filesRes.data.data.length <= 2);

      // Single file metrics
      const firstFile = filesRes.data.data[0];
      assert(firstFile, 'Must have at least one file');
      const singleFileRes = await request(
        'GET',
        `/api/scans/${syncScanId}/files/${encodeURIComponent(firstFile.relativePath)}`
      );
      assert.strictEqual(singleFileRes.status, 200);
      assert.strictEqual(singleFileRes.data.data.relativePath, firstFile.relativePath);
      assert(singleFileRes.data.data.riskBreakdown);

      // Duplicate groups
      const dupRes = await request('GET', `/api/scans/${syncScanId}/duplicates`);
      assert.strictEqual(dupRes.status, 200);
      assert(dupRes.data.summary);

      // Dependencies (Phase 5 placeholder)
      const depRes = await request('GET', `/api/scans/${syncScanId}/dependencies`);
      assert.strictEqual(depRes.status, 200);
      assert(Array.isArray(depRes.data.data.nodes));

      // Findings & Recommendations
      const findingsRes = await request('GET', `/api/scans/${syncScanId}/findings`);
      assert.strictEqual(findingsRes.status, 200);
      assert(Array.isArray(findingsRes.data.data.recommendations));

      console.log('PASSED');
    }

    // 5. Differential Scan Comparison
    {
      process.stdout.write('  - Testing Scan Comparison (/api/scans/compare)... ');

      // Run second scan on sample-repo synchronously for comparison
      const samplePath = path.resolve(__dirname, '../../test-fixtures/sample-repo');
      const scan2Res = await request('POST', '/api/scans?sync=true', {
        repoPath: samplePath
      });
      const secondScanId = scan2Res.data.data.scanId;

      const compareRes = await request(
        'GET',
        `/api/scans/compare?baseScanId=${secondScanId}&targetScanId=${syncScanId}`
      );
      assert.strictEqual(compareRes.status, 200);
      const diff = compareRes.data.data;
      assert(['IMPROVED', 'DEGRADED', 'STABLE'].includes(diff.trajectory));
      assert(typeof diff.summaryDeltas.deltaRiskScore === 'number');
      assert(Array.isArray(diff.modifiedFiles));

      console.log(`PASSED (Trajectory: ${diff.trajectory}, DeltaRisk: ${diff.summaryDeltas.deltaRiskScore})`);
    }

    // 6. Report Export (JSON, Markdown, CSV)
    {
      process.stdout.write('  - Testing Report Exporter (JSON, Markdown, CSV)... ');

      // JSON export
      const jsonRes = await request('GET', `/api/scans/${syncScanId}/export?format=json`);
      assert.strictEqual(jsonRes.status, 200);
      assert.strictEqual(jsonRes.data.scanId, syncScanId);

      // Markdown export
      const mdRes = await request('GET', `/api/scans/${syncScanId}/export?format=markdown`);
      assert.strictEqual(mdRes.status, 200);
      assert(typeof mdRes.data === 'string');
      assert(mdRes.data.includes('# CodeInsight Codebase Health & Technical Debt Report'));

      // CSV export
      const csvRes = await request('GET', `/api/scans/${syncScanId}/export?format=csv`);
      assert.strictEqual(csvRes.status, 200);
      assert(typeof csvRes.data === 'string');
      assert(csvRes.data.includes('Relative Path,Language,Total Lines'));

      console.log('PASSED');
    }

    // 7. Deletion & Cleanup
    {
      process.stdout.write('  - Testing Scan & Repository Deletion... ');

      // Delete scan
      const delScanRes = await request('DELETE', `/api/scans/${syncScanId}`);
      assert.strictEqual(delScanRes.status, 200);

      // Verify 404 after deletion
      const getDeletedScan = await request('GET', `/api/scans/${syncScanId}`);
      assert.strictEqual(getDeletedScan.status, 404);

      // Delete repository
      const delRepoRes = await request('DELETE', `/api/repositories/${testRepoId}`);
      assert.strictEqual(delRepoRes.status, 200);

      console.log('PASSED');
    }

    console.log('\n[ALL PHASE 8 API TESTS PASSED SUCCESSFULLY]\n');
  } finally {
    server.close();
  }
})().catch(err => {
  console.error('\n[API TEST FAILED]:', err);
  if (server) server.close();
  process.exit(1);
});
