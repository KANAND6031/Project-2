/**
 * CodeInsight Frontend & API Server Integration Test
 */
const http = require('http');
const app = require('../src/server');

async function testFrontendServe() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`[Test] Test server listening on http://localhost:${port}`);

  function fetchUrl(path) {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}${path}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      }).on('error', reject);
    });
  }

  try {
    // 1. Test /api/health
    const health = await fetchUrl('/api/health');
    console.log(`- GET /api/health: status=${health.status}`);
    if (health.status !== 200) throw new Error('Health check failed');
    const healthJson = JSON.parse(health.body);
    if (healthJson.status !== 'healthy') throw new Error('Health status unexpected');

    // 2. Test root GET / (Should serve frontend index.html)
    const index = await fetchUrl('/');
    console.log(`- GET / (SPA index): status=${index.status}`);
    if (index.status !== 200) throw new Error('Index serve failed');
    if (!index.body.includes('CodeInsight')) throw new Error('Index HTML missing CodeInsight title');
    if (!index.body.includes('vendor-charts')) throw new Error('Index HTML missing bundled vendor script link');

    // 3. Test SPA client-side routing fallback (e.g. /files, /duplicates)
    const routeFallback = await fetchUrl('/duplicates');
    console.log(`- GET /duplicates (SPA routing fallback): status=${routeFallback.status}`);
    if (routeFallback.status !== 200 || !routeFallback.body.includes('CodeInsight')) {
      throw new Error('SPA routing fallback failed');
    }

    console.log('\n[ALL FRONTEND & BACKEND SERVE TESTS PASSED]');
  } finally {
    server.close();
  }
}

testFrontendServe().catch(err => {
  console.error('[TEST FAILED]', err);
  process.exit(1);
});

