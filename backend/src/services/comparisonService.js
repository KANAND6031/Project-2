/**
 * CodeInsight Comparison Service
 * Phase 8: Differential Scan Comparison & Regression Analysis
 *
 * Compares two scans (Base Scan vs Target Scan) to identify:
 *  - Metric deltas (LOC, complexity, duplication, technical debt risk score)
 *  - Added, removed, and modified files
 *  - Degraded files (regressions / debt increase) vs Improved files
 *  - Overall codebase health trajectory
 */

class ComparisonService {
  /**
   * Compares a base scan and a target scan.
   * @param {Object} baseScan - Earlier baseline scan record
   * @param {Object} targetScan - Later target scan record
   * @returns {Object} Complete differential comparison report
   */
  compareScans(baseScan, targetScan) {
    if (!baseScan || !baseScan.report || !baseScan.report.summary) {
      throw new Error('Base scan does not contain completed scan results.');
    }
    if (!targetScan || !targetScan.report || !targetScan.report.summary) {
      throw new Error('Target scan does not contain completed scan results.');
    }

    const baseSum = baseScan.report.summary;
    const targetSum = targetScan.report.summary;

    const baseDebt = baseScan.report.technicalDebt || {};
    const targetDebt = targetScan.report.technicalDebt || {};

    // 1. Summary Deltas
    const baseRisk = baseDebt.repositoryRiskScore || 0;
    const targetRisk = targetDebt.repositoryRiskScore || 0;
    const deltaRiskScore = parseFloat((targetRisk - baseRisk).toFixed(1));

    const summaryDeltas = {
      deltaRiskScore,
      deltaTotalFiles: (targetSum.totalFiles || 0) - (baseSum.totalFiles || 0),
      deltaTotalLines: (targetSum.totalLines || 0) - (baseSum.totalLines || 0),
      deltaCodeLines: (targetSum.totalCodeLines || 0) - (baseSum.totalCodeLines || 0),
      deltaFunctions: (targetSum.totalFunctions || 0) - (baseSum.totalFunctions || 0),
      deltaAverageComplexity: parseFloat(
        ((targetSum.averageComplexity || 0) - (baseSum.averageComplexity || 0)).toFixed(2)
      ),
      deltaMaxComplexity: (targetSum.maxComplexity || 0) - (baseSum.maxComplexity || 0),
      deltaDuplicationLines: (targetSum.totalDuplicateLines || 0) - (baseSum.totalDuplicateLines || 0),
      deltaDuplicationPercentage: parseFloat(
        ((targetSum.overallDuplicationPercentage || 0) - (baseSum.overallDuplicationPercentage || 0)).toFixed(2)
      )
    };

    // Determine overall health trajectory
    let trajectory = 'STABLE';
    if (deltaRiskScore < -1.0) {
      trajectory = 'IMPROVED';
    } else if (deltaRiskScore > 1.0) {
      trajectory = 'DEGRADED';
    }

    // 2. File-by-File Differential Analysis
    const baseFilesMap = new Map();
    (baseScan.report.files || []).forEach(f => baseFilesMap.set(f.relativePath, f));

    const targetFilesMap = new Map();
    (targetScan.report.files || []).forEach(f => targetFilesMap.set(f.relativePath, f));

    const addedFiles = [];
    const removedFiles = [];
    const modifiedFiles = [];
    const degradedFiles = [];
    const improvedFiles = [];

    // Identify added and modified files
    for (const [relPath, targetFile] of targetFilesMap.entries()) {
      if (!baseFilesMap.has(relPath)) {
        addedFiles.push({
          relativePath: relPath,
          riskScore: targetFile.riskScore,
          severity: targetFile.severity,
          totalLines: targetFile.totalLines
        });
      } else {
        const baseFile = baseFilesMap.get(relPath);
        const fileDeltaRisk = parseFloat((targetFile.riskScore - baseFile.riskScore).toFixed(1));
        const fileDeltaLines = (targetFile.totalLines || 0) - (baseFile.totalLines || 0);
        const fileDeltaComplexity = (targetFile.complexitySummary?.maxComplexity || 0) - (baseFile.complexitySummary?.maxComplexity || 0);
        const fileDeltaDuplication = parseFloat(
          ((targetFile.duplicatePercentage || 0) - (baseFile.duplicatePercentage || 0)).toFixed(1)
        );

        let fileStatus = 'UNCHANGED';
        if (fileDeltaRisk > 0) {
          fileStatus = 'DEGRADED';
        } else if (fileDeltaRisk < 0) {
          fileStatus = 'IMPROVED';
        }

        const modInfo = {
          relativePath: relPath,
          baseRiskScore: baseFile.riskScore,
          targetRiskScore: targetFile.riskScore,
          deltaRiskScore: fileDeltaRisk,
          baseSeverity: baseFile.severity,
          targetSeverity: targetFile.severity,
          deltaLines: fileDeltaLines,
          deltaComplexity: fileDeltaComplexity,
          deltaDuplication: fileDeltaDuplication,
          status: fileStatus
        };

        modifiedFiles.push(modInfo);
        if (fileStatus === 'DEGRADED') degradedFiles.push(modInfo);
        if (fileStatus === 'IMPROVED') improvedFiles.push(modInfo);
      }
    }

    // Identify removed files
    for (const [relPath, baseFile] of baseFilesMap.entries()) {
      if (!targetFilesMap.has(relPath)) {
        removedFiles.push({
          relativePath: relPath,
          riskScore: baseFile.riskScore,
          severity: baseFile.severity,
          totalLines: baseFile.totalLines
        });
      }
    }

    // Sort degraded files by worst degradation first
    degradedFiles.sort((a, b) => b.deltaRiskScore - a.deltaRiskScore);
    improvedFiles.sort((a, b) => a.deltaRiskScore - b.deltaRiskScore);

    return {
      baseScan: {
        id: baseScan.id,
        createdAt: baseScan.createdAt,
        riskScore: baseRisk,
        severity: baseDebt.overallSeverity || 'LOW'
      },
      targetScan: {
        id: targetScan.id,
        createdAt: targetScan.createdAt,
        riskScore: targetRisk,
        severity: targetDebt.overallSeverity || 'LOW'
      },
      trajectory,
      summaryDeltas,
      fileCounts: {
        added: addedFiles.length,
        removed: removedFiles.length,
        modified: modifiedFiles.length,
        degraded: degradedFiles.length,
        improved: improvedFiles.length
      },
      degradedFiles,
      improvedFiles,
      addedFiles,
      removedFiles,
      modifiedFiles
    };
  }
}

module.exports = new ComparisonService();

