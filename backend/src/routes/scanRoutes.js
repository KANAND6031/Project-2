const express = require('express');
const router = express.Router();
const analyzerService = require('../services/analyzerService');

/**
 * POST /api/scan/run
 * Initiates an immediate scan of a target local repository path.
 */
router.post('/run', async (req, res) => {
  try {
    const { repoPath } = req.body;

    if (!repoPath) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field "repoPath" in request body.'
      });
    }

    const report = await analyzerService.runScan(repoPath);

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
 * GET /api/scan/status
 * Returns engine readiness and executable status.
 */
router.get('/status', (req, res) => {
  const fs = require('fs');
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

module.exports = router;
