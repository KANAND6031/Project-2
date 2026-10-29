/**
 * CodeInsight Technical Debt Risk Scorer
 * Phase 7: Configurable, Explainable Technical Debt Risk Scoring Engine
 *
 * Implements a multi-dimensional heuristic model combining:
 *  1. Cyclomatic Complexity & Nesting Depth (30% default)
 *  2. Code Duplication Percentage (25% default)
 *  3. Structural Size & Physical Metrics (10% default)
 *  4. Dependency Coupling Risk (20% default - extensible when Phase 5 active)
 *  5. Git Churn & Modification Frequency (15% default - extensible when Phase 6 active)
 *
 * Designed with dynamic weight re-normalization:
 * When metrics are absent (e.g., Phase 5/6 skipped or unconfigured), remaining active
 * weights automatically re-scale to sum to 1.0 (100%), preserving score integrity.
 */

const DEFAULT_WEIGHTS = {
  complexity: 0.30,
  duplication: 0.25,
  dependency: 0.20,
  churn: 0.15,
  structural: 0.10
};

const SEVERITY_LEVELS = {
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

class RiskScorer {
  constructor(customWeights = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...customWeights };
  }

  /**
   * Normalizes maximum cyclomatic complexity to a 0-100 scale using
   * a calibrated piecewise saturation curve based on McCabe guidelines.
   *
   * Thresholds:
   *   1 - 10: Low risk (score 0 - 30)
   *  11 - 25: Moderate to High risk (score 30 - 70)
   *  26 - 50: High to Very High risk (score 70 - 90)
   *     > 50: Critical / Unmaintainable (score 90 - 100)
   */
  normalizeMaxComplexity(maxComp) {
    if (!maxComp || maxComp <= 1) return 0;
    if (maxComp <= 10) {
      return parseFloat(((maxComp / 10) * 30).toFixed(2));
    }
    if (maxComp <= 25) {
      return parseFloat((30 + ((maxComp - 10) / 15) * 40).toFixed(2));
    }
    if (maxComp <= 50) {
      return parseFloat((70 + ((maxComp - 25) / 25) * 20).toFixed(2));
    }
    return Math.min(100, parseFloat((90 + ((maxComp - 50) / 50) * 10).toFixed(2)));
  }

  /**
   * Normalizes maximum nesting depth to a 0-100 scale.
   * Deeply nested control flow (depth >= 4) severely impedes code readability.
   */
  normalizeNestingDepth(maxNesting) {
    if (!maxNesting || maxNesting <= 1) return 0;
    if (maxNesting <= 3) {
      return parseFloat((((maxNesting - 1) / 2) * 40).toFixed(2));
    }
    if (maxNesting <= 5) {
      return parseFloat((40 + ((maxNesting - 3) / 2) * 40).toFixed(2));
    }
    return Math.min(100, parseFloat((80 + (maxNesting - 5) * 10).toFixed(2)));
  }

  /**
   * Calculates the unified Complexity Dimension Sub-Score (0-100).
   * Blends max cyclomatic complexity (65%) and max nesting depth (35%),
   * with an adjustment if multiple complex functions exist.
   */
  calculateComplexityScore(complexitySummary) {
    if (!complexitySummary || complexitySummary.totalFunctions === 0) {
      return 0;
    }

    const maxComp = complexitySummary.maxComplexity || 0;
    const maxNesting = complexitySummary.maxNestingDepth || 0;
    const complexCount = complexitySummary.complexFunctionCount || 0;

    const compScore = this.normalizeMaxComplexity(maxComp);
    const nestingScore = this.normalizeNestingDepth(maxNesting);

    let combined = (compScore * 0.65) + (nestingScore * 0.35);

    // Multi-function density modifier: multiple complex functions heighten file risk
    if (complexCount > 1) {
      const densityBonus = Math.min(15, (complexCount - 1) * 3);
      combined += densityBonus;
    }

    return Math.min(100, parseFloat(combined.toFixed(2)));
  }

  /**
   * Normalizes code duplication percentage (0-100) to a 0-100 risk score.
   * Employs non-linear scaling where >30% duplication rapidly escalates risk.
   */
  normalizeDuplication(dupPercentage) {
    const pct = Math.max(0, Math.min(100, Number(dupPercentage) || 0));
    if (pct === 0) return 0;
    if (pct <= 10) {
      return parseFloat(((pct / 10) * 20).toFixed(2));
    }
    if (pct <= 30) {
      return parseFloat((20 + ((pct - 10) / 20) * 35).toFixed(2));
    }
    if (pct <= 60) {
      return parseFloat((55 + ((pct - 30) / 30) * 30).toFixed(2));
    }
    return Math.min(100, parseFloat((85 + ((pct - 60) / 40) * 15).toFixed(2)));
  }

  /**
   * Normalizes physical file size and structural density (0-100).
   * Monolithic files (>500 LOC) and long lines indicate poor modularity.
   */
  normalizeStructuralMetrics(totalLines, maxLineLength = 0) {
    const loc = Math.max(0, Number(totalLines) || 0);
    if (loc === 0) return 0;

    let locScore;
    if (loc <= 100) {
      locScore = (loc / 100) * 15;
    } else if (loc <= 300) {
      locScore = 15 + ((loc - 100) / 200) * 20;
    } else if (loc <= 750) {
      locScore = 35 + ((loc - 300) / 450) * 35;
    } else if (loc <= 1500) {
      locScore = 70 + ((loc - 750) / 750) * 20;
    } else {
      locScore = Math.min(100, 90 + ((loc - 1500) / 1500) * 10);
    }

    let linePenalty = 0;
    if (maxLineLength > 150) {
      linePenalty = Math.min(10, ((maxLineLength - 150) / 150) * 10);
    }

    return Math.min(100, parseFloat(((locScore * 0.9) + linePenalty).toFixed(2)));
  }

  /**
   * Maps a numerical risk score (0-100) to its provisional severity level.
   */
  getSeverity(score) {
    if (score < 25) return SEVERITY_LEVELS.LOW;
    if (score < 50) return SEVERITY_LEVELS.MODERATE;
    if (score < 75) return SEVERITY_LEVELS.HIGH;
    return SEVERITY_LEVELS.CRITICAL;
  }

  /**
   * Computes the Technical Debt Risk Score for a single file.
   * Dynamically re-normalizes active weights when metrics are missing/skipped.
   *
   * @param {Object} file - File metrics object
   * @param {Object} options - Optional weight overrides
   * @returns {Object} Complete explainable score breakdown
   */
  scoreFile(file, options = {}) {
    const totalLines = file.totalLines || 0;

    // Edge case: empty or zero-line files
    if (totalLines === 0) {
      return {
        riskScore: 0,
        severity: SEVERITY_LEVELS.LOW,
        remediationPriority: {
          priority: 'P4',
          score: 0,
          label: 'Low Priority'
        },
        subScores: {
          complexity: 0,
          duplication: 0,
          structural: 0,
          dependency: null,
          churn: null
        },
        weightsApplied: {},
        riskFactors: ['Empty file or non-executable content'],
        contributingMetrics: []
      };
    }

    // Evaluate sub-scores
    const complexityScore = this.calculateComplexityScore(file.complexitySummary);
    const duplicationScore = this.normalizeDuplication(file.duplicatePercentage || 0);
    const structuralScore = this.normalizeStructuralMetrics(totalLines, file.maxLineLength || 0);

    // Dependency and Churn metrics (null if omitted / skipped)
    const dependencyScore = file.dependencyRisk !== undefined && file.dependencyRisk !== null
      ? Math.max(0, Math.min(100, file.dependencyRisk))
      : null;

    const churnScore = file.churnRisk !== undefined && file.churnRisk !== null
      ? Math.max(0, Math.min(100, file.churnRisk))
      : null;

    const rawSubScores = {
      complexity: complexityScore,
      duplication: duplicationScore,
      structural: structuralScore,
      dependency: dependencyScore,
      churn: churnScore
    };

    // Determine active weights
    const activeWeightsConfig = { ...this.weights, ...(options.weights || {}) };
    const activeDimensions = Object.keys(rawSubScores).filter(
      key => rawSubScores[key] !== null && rawSubScores[key] !== undefined
    );

    const sumActiveWeights = activeDimensions.reduce(
      (sum, key) => sum + (activeWeightsConfig[key] || 0),
      0
    );

    const normalizedWeights = {};
    activeDimensions.forEach(key => {
      normalizedWeights[key] = sumActiveWeights > 0
        ? parseFloat(((activeWeightsConfig[key] || 0) / sumActiveWeights).toFixed(4))
        : 0;
    });

    // Calculate weighted sum
    let totalScore = 0;
    const contributingMetrics = [];

    activeDimensions.forEach(key => {
      const weight = normalizedWeights[key];
      const raw = rawSubScores[key];
      const weighted = parseFloat((raw * weight).toFixed(2));
      totalScore += weighted;

      contributingMetrics.push({
        dimension: key,
        rawScore: raw,
        activeWeight: weight,
        weightedPoints: weighted,
        status: 'EVALUATED'
      });
    });

    // Record skipped / missing dimensions
    Object.keys(DEFAULT_WEIGHTS).forEach(key => {
      if (!activeDimensions.includes(key)) {
        contributingMetrics.push({
          dimension: key,
          rawScore: null,
          activeWeight: 0,
          weightedPoints: 0,
          status: 'SKIPPED_OR_MISSING'
        });
      }
    });

    totalScore = Math.min(100, Math.max(0, parseFloat(totalScore.toFixed(1))));

    // Calculate percentage contribution of each evaluated dimension
    contributingMetrics.forEach(metric => {
      if (metric.status === 'EVALUATED') {
        metric.contributionPercentage = totalScore > 0
          ? parseFloat(((metric.weightedPoints / totalScore) * 100).toFixed(1))
          : 0;
      } else {
        metric.contributionPercentage = 0;
      }
    });

    // Sort contributing metrics descending by weighted impact
    contributingMetrics.sort((a, b) => b.weightedPoints - a.weightedPoints);

    // Generate human-readable risk factors
    const riskFactors = this.generateRiskFactors(file, rawSubScores, totalScore);

    // Calculate remediation priority
    const remediationPriority = this.calculateRemediationPriority(file, totalScore);

    return {
      riskScore: totalScore,
      severity: this.getSeverity(totalScore),
      remediationPriority,
      subScores: rawSubScores,
      weightsApplied: normalizedWeights,
      riskFactors,
      contributingMetrics
    };
  }

  /**
   * Generates clear, human-understandable explanations for why a file received its score.
   */
  generateRiskFactors(file, subScores, totalScore) {
    const factors = [];
    const comp = file.complexitySummary || {};

    if (comp.maxComplexity > 10) {
      const worstFunc = (file.functions || []).reduce(
        (prev, curr) => (curr.cyclomaticComplexity > (prev?.cyclomaticComplexity || 0) ? curr : prev),
        null
      );
      const funcName = worstFunc ? `'${worstFunc.name}'` : 'highest function';
      factors.push(
        `High cyclomatic complexity: ${funcName} reaches McCabe complexity of ${comp.maxComplexity} (threshold: >10)`
      );
    }

    if (comp.maxNestingDepth >= 4) {
      factors.push(
        `Deep nesting depth: control-flow indents to ${comp.maxNestingDepth} levels (threshold: >=4)`
      );
    }

    if (comp.complexFunctionCount > 1) {
      factors.push(
        `High complexity density: ${comp.complexFunctionCount} functions exceed acceptable McCabe thresholds`
      );
    }

    if (file.duplicatePercentage >= 20) {
      factors.push(
        `Significant code duplication: ${file.duplicatePercentage}% of lines are identical duplicate blocks`
      );
    }

    if (file.totalLines > 500) {
      factors.push(
        `Large file size: ${file.totalLines} lines of code indicates poor modularity / God-object risk (threshold: >500 LOC)`
      );
    }

    if (file.maxLineLength > 200) {
      factors.push(
        `Excessive line length: maximum line spans ${file.maxLineLength} characters (threshold: >200 chars)`
      );
    }

    if (factors.length === 0) {
      if (totalScore < 25) {
        factors.push('Clean code structure: all metrics within recommended thresholds');
      } else {
        factors.push('Moderate cumulative structural debt distributed across multiple metrics');
      }
    }

    return factors;
  }

  /**
   * Calculates a separate Remediation Priority Score based on:
   *   Priority = (RiskScore * ImpactMultiplier) / EffortFactor
   *
   * Assumptions:
   *  - Impact is elevated if the file contains numerous functions or high-complexity entry points.
   *  - Effort increases with monolithic LOC and volume of complex functions to refactor.
   *  - Highest priority (P1) is assigned to files with high risk and high impact-to-effort payoff.
   */
  calculateRemediationPriority(file, riskScore) {
    if (riskScore === 0) {
      return { priority: 'P4', score: 0, label: 'Low' };
    }

    const comp = file.complexitySummary || {};
    const totalLines = file.totalLines || 0;
    const complexCount = comp.complexFunctionCount || 0;
    const totalFuncs = comp.totalFunctions || 0;

    // Impact Factor (1.0 to 1.5): files containing many functions have wider blast radius
    let impactMultiplier = 1.0;
    if (complexCount > 0) impactMultiplier += Math.min(0.3, complexCount * 0.1);
    if (totalFuncs > 5) impactMultiplier += 0.2;

    // Effort Factor (1.0 to 2.5): larger files and more complex functions require higher effort
    let effortFactor = 1.0;
    if (totalLines > 300) effortFactor += Math.min(0.8, (totalLines - 300) / 1000);
    if (complexCount > 1) effortFactor += Math.min(0.7, (complexCount - 1) * 0.2);

    const rawPriorityScore = parseFloat(((riskScore * impactMultiplier) / effortFactor).toFixed(1));
    const normalizedPriorityScore = Math.min(100, Math.max(0, rawPriorityScore));

    let priority = 'P4';
    let label = 'Low';

    if (riskScore >= 75 || normalizedPriorityScore >= 70) {
      priority = 'P1';
      label = 'Urgent';
    } else if (riskScore >= 50 || normalizedPriorityScore >= 45) {
      priority = 'P2';
      label = 'High';
    } else if (riskScore >= 25 || normalizedPriorityScore >= 25) {
      priority = 'P3';
      label = 'Medium';
    }

    return {
      priority,
      score: normalizedPriorityScore,
      label,
      factors: {
        impactMultiplier: parseFloat(impactMultiplier.toFixed(2)),
        effortFactor: parseFloat(effortFactor.toFixed(2))
      }
    };
  }

  /**
   * Scores an entire scanned repository report.
   * Enriches each file with risk metrics, calculates repository-level aggregates,
   * identifies top hotspots, and generates actionable recommendations.
   *
   * @param {Object} scanReport - Full scan result from scanner/analyzer
   * @param {Object} options - Configuration overrides
   * @returns {Object} Enriched scan report
   */
  scoreRepository(scanReport, options = {}) {
    if (!scanReport || !Array.isArray(scanReport.files)) {
      throw new Error('Invalid scan report provided to scoreRepository.');
    }

    let sumRisk = 0;
    let weightedLocRiskSum = 0;
    let totalCodeLines = 0;

    const distribution = {
      [SEVERITY_LEVELS.LOW]: 0,
      [SEVERITY_LEVELS.MODERATE]: 0,
      [SEVERITY_LEVELS.HIGH]: 0,
      [SEVERITY_LEVELS.CRITICAL]: 0
    };

    const scoredFiles = scanReport.files.map(file => {
      const scoreData = this.scoreFile(file, options);
      distribution[scoreData.severity] = (distribution[scoreData.severity] || 0) + 1;

      sumRisk += scoreData.riskScore;
      const lines = file.codeLines || file.totalLines || 0;
      weightedLocRiskSum += scoreData.riskScore * lines;
      totalCodeLines += lines;

      return {
        ...file,
        riskScore: scoreData.riskScore,
        severity: scoreData.severity,
        remediationPriority: scoreData.remediationPriority,
        riskBreakdown: {
          subScores: scoreData.subScores,
          weightsApplied: scoreData.weightsApplied,
          riskFactors: scoreData.riskFactors,
          contributingMetrics: scoreData.contributingMetrics
        }
      };
    });

    const fileCount = scoredFiles.length;
    const averageRisk = fileCount > 0 ? parseFloat((sumRisk / fileCount).toFixed(1)) : 0;
    const weightedAverageRisk = totalCodeLines > 0
      ? parseFloat((weightedLocRiskSum / totalCodeLines).toFixed(1))
      : averageRisk;

    // Rank files in descending order of risk score
    const rankedFiles = [...scoredFiles].sort((a, b) => b.riskScore - a.riskScore);

    // Top hotspots (files with High or Critical severity, or top 5)
    const hotspots = rankedFiles
      .filter(f => f.riskScore >= 50)
      .slice(0, 10)
      .map(f => ({
        relativePath: f.relativePath,
        riskScore: f.riskScore,
        severity: f.severity,
        remediationPriority: f.remediationPriority.priority,
        primaryDriver: f.riskBreakdown.contributingMetrics[0]?.dimension || 'overall',
        topFactor: f.riskBreakdown.riskFactors[0] || 'Cumulative technical debt'
      }));

    // Generate actionable findings & recommendations
    const recommendations = this.generateRepositoryRecommendations(scoredFiles, distribution);

    scanReport.files = scoredFiles;
    scanReport.technicalDebt = {
      repositoryRiskScore: weightedAverageRisk,
      unweightedAverageRisk: averageRisk,
      overallSeverity: this.getSeverity(weightedAverageRisk),
      riskDistribution: distribution,
      riskDistributionPercentages: {
        low: fileCount > 0 ? parseFloat(((distribution.LOW / fileCount) * 100).toFixed(1)) : 0,
        moderate: fileCount > 0 ? parseFloat(((distribution.MODERATE / fileCount) * 100).toFixed(1)) : 0,
        high: fileCount > 0 ? parseFloat(((distribution.HIGH / fileCount) * 100).toFixed(1)) : 0,
        critical: fileCount > 0 ? parseFloat(((distribution.CRITICAL / fileCount) * 100).toFixed(1)) : 0
      },
      topHotspots: hotspots,
      activeWeights: scoredFiles[0]?.riskBreakdown?.weightsApplied || {},
      recommendations
    };

    return scanReport;
  }

  /**
   * Synthesizes actionable engineering recommendations based on aggregate debt patterns.
   */
  generateRepositoryRecommendations(files, distribution) {
    const recs = [];

    if (distribution.CRITICAL > 0) {
      recs.push({
        id: 'REC_CRITICAL_FILES',
        severity: 'CRITICAL',
        title: `Address ${distribution.CRITICAL} Critical-Risk Files Immediately`,
        description: `${distribution.CRITICAL} file(s) exhibit dangerous combinations of extreme complexity, duplication, or monolithic size. Prioritize these in upcoming refactoring sprints.`
      });
    }

    // Check for high-duplication prevalence
    const highDupFiles = files.filter(f => (f.duplicatePercentage || 0) >= 30);
    if (highDupFiles.length > 0) {
      recs.push({
        id: 'REC_CONSOLIDATE_CLONES',
        severity: 'HIGH',
        title: `Extract Shared Utilities for ${highDupFiles.length} Highly Duplicated Files`,
        description: `Over 30% of code in ${highDupFiles.length} file(s) consists of cloned blocks. Consolidating repeated algorithms into shared modules will reduce maintenance overhead.`
      });
    }

    // Check for complex functions
    const complexFuncCount = files.reduce((acc, f) => acc + (f.complexitySummary?.complexFunctionCount || 0), 0);
    if (complexFuncCount > 0) {
      recs.push({
        id: 'REC_DECOMPOSE_FUNCTIONS',
        severity: 'MEDIUM',
        title: `Decompose ${complexFuncCount} Functions with Cyclomatic Complexity > 10`,
        description: `Functions exceeding McCabe complexity 10 require extensive branch testing and are prone to regression. Break them down into smaller, single-responsibility helpers.`
      });
    }

    // Check for large files
    const largeFiles = files.filter(f => (f.totalLines || 0) > 500);
    if (largeFiles.length > 0) {
      recs.push({
        id: 'REC_MODULARIZE_GOD_OBJECTS',
        severity: 'MEDIUM',
        title: `Modularize ${largeFiles.length} Monolithic Files Exceeding 500 LOC`,
        description: `Large files violate the Single Responsibility Principle and increase merge conflicts. Split them into domain-driven sub-components.`
      });
    }

    if (recs.length === 0) {
      recs.push({
        id: 'REC_MAINTAIN_STANDARD',
        severity: 'LOW',
        title: 'Maintain Current High Codebase Health Standards',
        description: 'No severe technical debt hotspots detected. Continue adhering to modular design and automated regression scanning.'
      });
    }

    return recs;
  }
}

module.exports = new RiskScorer();
module.exports.RiskScorer = RiskScorer;
module.exports.DEFAULT_WEIGHTS = DEFAULT_WEIGHTS;
module.exports.SEVERITY_LEVELS = SEVERITY_LEVELS;

