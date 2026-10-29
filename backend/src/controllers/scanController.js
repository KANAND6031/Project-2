/**
 * CodeInsight Scan Controller
 * Phase 8: Comprehensive Scan Management & Query REST API
 */

const storageService = require('../services/storageService');
const scanQueueService = require('../services/scanQueueService');
const comparisonService = require('../services/comparisonService');
const exportService = require('../services/exportService');

class ScanController {
  /**
   * POST /api/scans
   * Initiates a new background (or sync) scan.
   */
  async startScan(req, res) {
    try {
      const { repoId, repoPath, weights, timeoutMs } = req.body;
      const isSync = req.query.sync === 'true';

      const scan = await scanQueueService.enqueueScan({
        repoId,
        repoPath,
        weights,
        timeoutMs: Number(timeoutMs) || 30000,
        sync: isSync
      });

      const statusCode = isSync ? 200 : 202;
      return res.status(statusCode).json({
        success: true,
        message: isSync ? 'Scan completed synchronously.' : 'Scan enqueued successfully.',
        data: {
          id: scan.id,
          scanId: scan.id,
          repoId: scan.repoId,
          repoPath: scan.repoPath,
          status: scan.status,
          createdAt: scan.createdAt,
          report: isSync ? scan.report : undefined
        }
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * GET /api/scans
   * Lists all scans, optionally filtered by repoId or status.
   */
  listScans(req, res) {
    try {
      const { repoId, status } = req.query;
      const scans = storageService.listScans({ repoId, status }).map(s => ({
        id: s.id,
        repoId: s.repoId,
        repoPath: s.repoPath,
        status: s.status,
        createdAt: s.createdAt,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        durationMs: s.durationMs,
        riskScore: s.report?.technicalDebt?.repositoryRiskScore ?? null,
        severity: s.report?.technicalDebt?.overallSeverity ?? null,
        totalFiles: s.report?.summary?.totalFiles ?? null,
        error: s.error
      }));

      return res.status(200).json({
        success: true,
        count: scans.length,
        data: scans
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * GET /api/scans/:scanId
   * Retrieves complete scan record with full JSON report.
   */
  getScanById(req, res) {
    try {
      const scan = storageService.getScanById(req.params.scanId);
      if (!scan) {
        return res.status(404).json({
          success: false,
          error: `Scan not found with ID: ${req.params.scanId}`
        });
      }

      return res.status(200).json({
        success: true,
        data: scan
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * GET /api/scans/:scanId/status
   * Polling endpoint to check scan job status.
   */
  getScanStatus(req, res) {
    try {
      const status = scanQueueService.getScanStatus(req.params.scanId);
      if (!status) {
        return res.status(404).json({
          success: false,
          error: `Scan not found with ID: ${req.params.scanId}`
        });
      }

      return res.status(200).json({
        success: true,
        data: status
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * GET /api/scans/:scanId/summary
   * Fetches high-level executive summary of a completed scan.
   */
  getScanSummary(req, res) {
    try {
      const scan = storageService.getScanById(req.params.scanId);
      if (!scan) {
        return res.status(404).json({
          success: false,
          error: `Scan not found with ID: ${req.params.scanId}`
        });
      }

      if (scan.status !== 'completed' || !scan.report) {
        return res.status(400).json({
          success: false,
          error: `Scan is not completed yet (current status: ${scan.status}).`
        });
      }

      const rep = scan.report;
      return res.status(200).json({
        success: true,
        data: {
          scanId: scan.id,
          repoPath: scan.repoPath,
          engineVersion: rep.engineVersion,
          scanTimestamp: rep.scanTimestamp,
          durationMs: scan.durationMs,
          summary: rep.summary,
          technicalDebt: rep.technicalDebt
        }
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * GET /api/scans/:scanId/files
   * Returns analyzed files with filtering, sorting, and pagination.
   */
  getScanFiles(req, res) {
    try {
      const scan = storageService.getScanById(req.params.scanId);
      if (!scan || scan.status !== 'completed' || !scan.report) {
        return res.status(404).json({
          success: false,
          error: `Completed scan not found with ID: ${req.params.scanId}`
        });
      }

      let files = [...(scan.report.files || [])];
      const { severity, language, search, sort = 'riskScore', order = 'desc', limit = 100, offset = 0 } = req.query;

      // Filter by severity
      if (severity) {
        const targetSev = severity.toUpperCase();
        files = files.filter(f => f.severity === targetSev);
      }

      // Filter by language
      if (language) {
        files = files.filter(f => f.language.toLowerCase() === language.toLowerCase());
      }

      // Search by relative path or file name
      if (search) {
        const q = search.toLowerCase();
        files = files.filter(f => f.relativePath.toLowerCase().includes(q) || f.fileName.toLowerCase().includes(q));
      }

      // Sorting
      const isAsc = String(order).toLowerCase() === 'asc';
      files.sort((a, b) => {
        let valA = a[sort];
        let valB = b[sort];

        if (sort === 'maxComplexity') {
          valA = a.complexitySummary?.maxComplexity || 0;
          valB = b.complexitySummary?.maxComplexity || 0;
        }

        if (typeof valA === 'string') {
          return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return isAsc ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
      });

      // Pagination
      const totalCount = files.length;
      const numOffset = Math.max(0, parseInt(offset, 10) || 0);
      const numLimit = Math.max(1, parseInt(limit, 10) || 50);
      const paginated = files.slice(numOffset, numOffset + numLimit);

      return res.status(200).json({
        success: true,
        pagination: {
          total: totalCount,
          offset: numOffset,
          limit: numLimit,
          returned: paginated.length
        },
        data: paginated
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * GET /api/scans/:scanId/files/:fileId
   * Retrieves detailed metrics for an individual analyzed file.
   */
  getFileMetrics(req, res) {
    try {
      const scan = storageService.getScanById(req.params.scanId);
      if (!scan || scan.status !== 'completed' || !scan.report) {
        return res.status(404).json({
          success: false,
          error: `Completed scan not found with ID: ${req.params.scanId}`
        });
      }

      const fileId = decodeURIComponent(req.params.fileId);
      const file = (scan.report.files || []).find(
        f => f.relativePath === fileId || f.fileName === fileId || f.absolutePath === fileId
      );

      if (!file) {
        return res.status(404).json({
          success: false,
          error: `File not found in scan: ${fileId}`
        });
      }

      return res.status(200).json({
        success: true,
        data: file
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * GET /api/scans/:scanId/duplicates
   * Retrieves duplicate code blocks and clone groups.
   */
  getDuplicateGroups(req, res) {
    try {
      const scan = storageService.getScanById(req.params.scanId);
      if (!scan || scan.status !== 'completed' || !scan.report) {
        return res.status(404).json({
          success: false,
          error: `Completed scan not found with ID: ${req.params.scanId}`
        });
      }

      return res.status(200).json({
        success: true,
        summary: {
          totalDuplicateBlocks: scan.report.summary?.totalDuplicateBlocks || 0,
          totalDuplicateLines: scan.report.summary?.totalDuplicateLines || 0,
          overallDuplicationPercentage: scan.report.summary?.overallDuplicationPercentage || 0
        },
        count: scan.report.duplicateGroups?.length || 0,
        data: scan.report.duplicateGroups || []
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * GET /api/scans/:scanId/dependencies
   * Returns dependency graph nodes and edges.
   * Gracefully returns an empty graph structure while Phase 5 is in pending status.
   */
  getDependencies(req, res) {
    try {
      const scan = storageService.getScanById(req.params.scanId);
      if (!scan || scan.status !== 'completed' || !scan.report) {
        return res.status(404).json({
          success: false,
          error: `Completed scan not found with ID: ${req.params.scanId}`
        });
      }

      // Format Cytoscape.js compatible payload
      const nodes = (scan.report.files || []).map(f => ({
        data: {
          id: f.relativePath,
          label: f.fileName,
          riskScore: f.riskScore,
          severity: f.severity,
          totalLines: f.totalLines
        }
      }));

      return res.status(200).json({
        success: true,
        status: 'PHASE_5_PENDING',
        message: 'Static dependency extraction is scheduled for Phase 5. Graph structure formatted for Cytoscape.js.',
        data: {
          nodes,
          edges: [],
          metrics: {
            totalNodes: nodes.length,
            totalEdges: 0,
            hasCycles: false,
            cycles: []
          }
        }
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * GET /api/scans/:scanId/findings
   * Retrieves high-risk hotspots and actionable recommendations.
   */
  getFindings(req, res) {
    try {
      const scan = storageService.getScanById(req.params.scanId);
      if (!scan || scan.status !== 'completed' || !scan.report) {
        return res.status(404).json({
          success: false,
          error: `Completed scan not found with ID: ${req.params.scanId}`
        });
      }

      const debt = scan.report.technicalDebt || {};
      return res.status(200).json({
        success: true,
        data: {
          repositoryRiskScore: debt.repositoryRiskScore,
          overallSeverity: debt.overallSeverity,
          formula: debt.formula,
          topHotspots: debt.topHotspots || [],
          recommendations: debt.recommendations || []
        }
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * GET /api/scans/compare?baseScanId=...&targetScanId=...
   * Differential scan comparison between two scans.
   */
  compare(req, res) {
    try {
      const { baseScanId, targetScanId } = req.query;

      if (!baseScanId || !targetScanId) {
        return res.status(400).json({
          success: false,
          error: 'Query parameters "baseScanId" and "targetScanId" are both required for comparison.'
        });
      }

      const baseScan = storageService.getScanById(baseScanId);
      const targetScan = storageService.getScanById(targetScanId);

      if (!baseScan) {
        return res.status(404).json({
          success: false,
          error: `Base scan not found with ID: ${baseScanId}`
        });
      }

      if (!targetScan) {
        return res.status(404).json({
          success: false,
          error: `Target scan not found with ID: ${targetScanId}`
        });
      }

      const diffReport = comparisonService.compareScans(baseScan, targetScan);

      return res.status(200).json({
        success: true,
        data: diffReport
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * GET /api/scans/:scanId/export?format=json|markdown|csv
   * Exports scan report in requested format.
   */
  exportReport(req, res) {
    try {
      const scan = storageService.getScanById(req.params.scanId);
      if (!scan || scan.status !== 'completed' || !scan.report) {
        return res.status(404).json({
          success: false,
          error: `Completed scan not found with ID: ${req.params.scanId}`
        });
      }

      const format = (req.query.format || 'json').toLowerCase();

      if (format === 'markdown' || format === 'md') {
        const markdown = exportService.exportMarkdown(scan);
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="codeinsight-report-${scan.id}.md"`);
        return res.status(200).send(markdown);
      } else if (format === 'csv') {
        const csv = exportService.exportCsv(scan);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="codeinsight-metrics-${scan.id}.csv"`);
        return res.status(200).send(csv);
      } else {
        const json = exportService.exportJson(scan);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="codeinsight-scan-${scan.id}.json"`);
        return res.status(200).send(json);
      }
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  /**
   * DELETE /api/scans/:scanId
   * Deletes a scan record.
   */
  deleteScan(req, res) {
    try {
      const deleted = storageService.deleteScan(req.params.scanId);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: `Scan not found with ID: ${req.params.scanId}`
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Scan deleted successfully.'
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
}

module.exports = new ScanController();

