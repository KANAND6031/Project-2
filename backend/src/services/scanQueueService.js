/**
 * CodeInsight Scan Queue Service
 * Phase 8: Asynchronous Job Execution & Scan Lifecycle Manager
 *
 * Manages scan lifecycle: queued -> running -> completed / failed.
 * Executes child process / integrated analyzer asynchronously,
 * records duration, updates repository statistics, and captures errors.
 */

const fs = require('fs');
const path = require('path');
const storageService = require('./storageService');
const analyzerService = require('./analyzerService');

class ScanQueueService {
  /**
   * Enqueues or immediately executes a scan for a given repository.
   * @param {Object} params - { repoId, repoPath, weights, timeoutMs, sync }
   * @returns {Object} Scan record
   */
  async enqueueScan({ repoId, repoPath, weights, timeoutMs = 30000, sync = false }) {
    let targetPath = repoPath;
    let repository = null;

    if (repoId) {
      repository = storageService.getRepositoryById(repoId);
      if (!repository) {
        throw new Error(`Repository not found with ID: ${repoId}`);
      }
      targetPath = repository.path;
    } else if (targetPath) {
      targetPath = path.resolve(targetPath);
      repository = storageService.findRepositoryByPath(targetPath);
      if (!repository && fs.existsSync(targetPath)) {
        // Auto-register repository if not registered
        repository = storageService.createRepository({
          name: path.basename(targetPath),
          path: targetPath,
          description: 'Auto-registered during scan submission'
        });
      }
    } else {
      throw new Error('Either "repoId" or "repoPath" must be specified.');
    }

    if (!fs.existsSync(targetPath)) {
      throw new Error(`Repository path does not exist on disk: ${targetPath}`);
    }

    const scan = storageService.createScan({
      repoId: repository ? repository.id : null,
      repoPath: targetPath,
      weights,
      status: 'queued'
    });

    if (sync) {
      // Execute synchronously and await result
      await this.processScan(scan.id, timeoutMs);
      return storageService.getScanById(scan.id);
    }

    // Process asynchronously in background
    setImmediate(() => {
      this.processScan(scan.id, timeoutMs).catch(err => {
        console.error(`[ScanQueue] Background job ${scan.id} failed:`, err.message);
      });
    });

    return scan;
  }

  /**
   * Executes the analysis pipeline for an enqueued scan.
   */
  async processScan(scanId, timeoutMs = 30000) {
    const scan = storageService.getScanById(scanId);
    if (!scan) return;

    const startTime = Date.now();
    storageService.updateScan(scanId, {
      status: 'running',
      startedAt: new Date().toISOString()
    });

    try {
      const report = await analyzerService.runScan(scan.repoPath, {
        weights: scan.weights,
        timeoutMs
      });

      const endTime = Date.now();
      const durationMs = endTime - startTime;

      storageService.updateScan(scanId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        durationMs,
        report,
        error: null
      });

      // Update parent repository statistics
      if (scan.repoId) {
        const repo = storageService.getRepositoryById(scan.repoId);
        if (repo) {
          const debt = report.technicalDebt || {};
          storageService.updateRepository(scan.repoId, {
            lastScanId: scanId,
            lastScannedAt: new Date().toISOString(),
            latestRiskScore: debt.repositoryRiskScore !== undefined ? debt.repositoryRiskScore : null,
            latestSeverity: debt.overallSeverity || null,
            scanCount: (repo.scanCount || 0) + 1
          });
        }
      }

      return report;
    } catch (err) {
      const endTime = Date.now();
      const durationMs = endTime - startTime;

      storageService.updateScan(scanId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        durationMs,
        error: err.message
      });

      throw err;
    }
  }

  /**
   * Retrieves current status and elapsed time for a scan job.
   */
  getScanStatus(scanId) {
    const scan = storageService.getScanById(scanId);
    if (!scan) return null;

    let elapsedMs = scan.durationMs;
    if (scan.status === 'running' && scan.startedAt) {
      elapsedMs = Date.now() - new Date(scan.startedAt).getTime();
    }

    return {
      scanId: scan.id,
      repoId: scan.repoId,
      status: scan.status,
      createdAt: scan.createdAt,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      elapsedMs,
      error: scan.error,
      hasReport: !!scan.report
    };
  }
}

module.exports = new ScanQueueService();

