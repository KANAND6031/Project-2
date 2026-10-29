/**
 * CodeInsight Scan Routes
 * Phase 8: REST API Endpoints for Scans, Metrics, Comparison & Export
 */

const express = require('express');
const router = express.Router();
const scanController = require('../controllers/scanController');
const analyzerService = require('../services/analyzerService');
const fs = require('fs');

// --- 1. LEGACY & ENGINE STATUS ENDPOINTS ---

/**
 * POST /api/scans/run or /api/scan/run
 * Synchronous immediate scan for backwards compatibility.
 */
router.post('/run', async (req, res) => {
  try {
    const { repoPath, weights, timeoutMs } = req.body;
    if (!repoPath) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field "repoPath" in request body.'
      });
    }

    const report = await analyzerService.runScan(repoPath, { weights, timeoutMs });
    return res.status(200).json({
      success: true,
      message: 'Scan completed successfully.',
      data: report
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/scans/engine-status or /api/scan/status
 * Engine executable readiness status.
 */
router.get('/engine-status', (req, res) => {
  const exePath = analyzerService.getExecutablePath();
  const exists = fs.existsSync(exePath);

  res.status(200).json({
    status: 'ok',
    engineExecutable: {
      path: exePath,
      available: exists
    }
  });
});

// Also support /status for backward compatibility when no scanId is provided
router.get('/status', (req, res) => {
  const exePath = analyzerService.getExecutablePath();
  const exists = fs.existsSync(exePath);

  res.status(200).json({
    status: 'ok',
    engineExecutable: {
      path: exePath,
      available: exists
    }
  });
});

// --- 2. SCAN COMPARISON ---
// (Must be defined before /:scanId to prevent 'compare' from matching as scanId)
router.get('/compare', (req, res) => scanController.compare(req, res));

// --- 3. CORE SCAN LIFECYCLE ENDPOINTS ---
router.post('/', (req, res) => scanController.startScan(req, res));
router.get('/', (req, res) => scanController.listScans(req, res));

// --- 4. SCAN METRICS & QUERY SUB-RESOURCES ---
router.get('/:scanId/status', (req, res) => scanController.getScanStatus(req, res));
router.get('/:scanId/summary', (req, res) => scanController.getScanSummary(req, res));
router.get('/:scanId/files', (req, res) => scanController.getScanFiles(req, res));
router.get('/:scanId/files/:fileId(*)', (req, res) => scanController.getFileMetrics(req, res));
router.get('/:scanId/duplicates', (req, res) => scanController.getDuplicateGroups(req, res));
router.get('/:scanId/dependencies', (req, res) => scanController.getDependencies(req, res));
router.get('/:scanId/findings', (req, res) => scanController.getFindings(req, res));
router.get('/:scanId/export', (req, res) => scanController.exportReport(req, res));

// Full scan details & deletion
router.get('/:scanId', (req, res) => scanController.getScanById(req, res));
router.delete('/:scanId', (req, res) => scanController.deleteScan(req, res));

module.exports = router;
