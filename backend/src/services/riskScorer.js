/**
 * CodeInsight Technical Debt Risk Scorer
 * Phase 7: Technical Debt Risk Scoring Engine
 *
 * Implements the formula:
 *   R = 0.45 * C + 0.35 * D + 0.20 * S
 *
 * Where:
 *   - R = Overall file risk score (0–100)
 *   - C = Normalized complexity score (0–100, 45% weight)
 *   - D = Normalized duplication score (0–100, 35% weight)
 *   - S = Normalized size and structural score (0–100, 20% weight)
 *         S = 0.40 * L + 0.35 * N + 0.25 * P
 *         (L = Length score, N = Nesting score, P = Parameter score)
 */

const DEFAULT_WEIGHTS = {
  complexity: 0.45,
  duplication: 0.35,
  structural: 0.20
};

const DEFAULT_STRUCTURAL_WEIGHTS = {
  length: 0.40,
  nesting: 0.35,
  parameters: 0.25
};

const DEFAULT_THRESHOLDS = {
  complexity: [
    { max: 5, score: 10 },
    { max: 10, score: 35 },
    { max: 15, score: 65 },
    { max: Infinity, score: 90 }
  ],
  duplication: [
    { max: 0, score: 0 },
    { max: 5, score: 20 },
    { max: 10, score: 40 },
    { max: 20, score: 70 },
    { max: Infinity, score: 90 }
  ],
  length: [
    { maxLoc: 100, maxFuncLen: 30, score: 10 },
    { maxLoc: 300, maxFuncLen: 60, score: 35 },
    { maxLoc: 700, maxFuncLen: 120, score: 65 },
    { maxLoc: Infinity, maxFuncLen: Infinity, score: 90 }
  ],
  nesting: [
    { max: 1, score: 10 },
    { max: 2, score: 35 },
    { max: 3, score: 65 },
    { max: Infinity, score: 90 }
  ],
  parameters: [
    { max: 2, score: 10 },
    { max: 4, score: 35 },
    { max: 6, score: 65 },
    { max: Infinity, score: 90 }
  ]
};

const SEVERITY_LEVELS = {
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

class RiskScorer {
  constructor(customWeights = {}, customThresholds = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...customWeights };
    this.structuralWeights = { ...DEFAULT_STRUCTURAL_WEIGHTS, ...(customWeights.structuralBreakdown || {}) };
    this.thresholds = {
      complexity: customThresholds.complexity || DEFAULT_THRESHOLDS.complexity,
      duplication: customThresholds.duplication || DEFAULT_THRESHOLDS.duplication,
      length: customThresholds.length || DEFAULT_THRESHOLDS.length,
      nesting: customThresholds.nesting || DEFAULT_THRESHOLDS.nesting,
      parameters: customThresholds.parameters || DEFAULT_THRESHOLDS.parameters
    };
  }

  /**
   * Calculates normalized complexity score C (0–100, 45% weight)
   * Maximum function complexity:
   *   1–5   => 10
   *   6–10  => 35
   *   11–15 => 65
   *   >15   => 90
   *   (0 or no functions => 0)
   */
  calculateComplexityScore(maxComplexity, totalFunctions = 0) {
    if (!totalFunctions || maxComplexity <= 0) return 0;
    for (const t of this.thresholds.complexity) {
      if (maxComplexity <= t.max) return t.score;
    }
    return 90;
  }

  /**
   * Calculates normalized duplication score D (0–100, 35% weight)
   * Duplication percentage:
   *   0%    => 0
   *   1–5%  => 20
   *   6–10% => 40
   *   11–20%=> 70
   *   >20%  => 90
   */
  calculateDuplicationScore(dupPercentage) {
    const pct = Math.max(0, Math.min(100, Number(dupPercentage) || 0));
    if (pct === 0) return 0;
    for (const t of this.thresholds.duplication) {
      if (pct <= t.max) return t.score;
    }
    return 90;
  }

  /**
   * Calculates normalized length score L (0–100)
   * Evaluates total file lines of code and maximum function length:
   *   LOC <= 100 && maxFuncLen <= 30  => 10
   *   LOC <= 300 && maxFuncLen <= 60  => 35
   *   LOC <= 700 && maxFuncLen <= 120 => 65
   *   Above => 90
   */
  calculateLengthScore(totalLines, maxFuncLen = 0) {
    if (totalLines <= 0) return 0;
    for (const t of this.thresholds.length) {
      if (totalLines <= t.maxLoc && maxFuncLen <= t.maxFuncLen) return t.score;
    }
    return 90;
  }

  /**
   * Calculates normalized nesting depth score N (0–100)
   *   Depth <= 1 => 10 (or 0 if no functions)
   *   Depth == 2 => 35
   *   Depth == 3 => 65
   *   Depth >= 4 => 90
   */
  calculateNestingScore(maxNesting, totalFunctions = 0) {
    if (!totalFunctions) return 0;
    for (const t of this.thresholds.nesting) {
      if (maxNesting <= t.max) return t.score;
    }
    return 90;
  }

  /**
   * Calculates normalized parameter count score P (0–100)
   *   Params <= 2 => 10
   *   Params 3–4  => 35
   *   Params 5–6  => 65
   *   Params > 6  => 90
   */
  calculateParameterScore(maxParams, totalFunctions = 0) {
    if (!totalFunctions) return 0;
    for (const t of this.thresholds.parameters) {
      if (maxParams <= t.max) return t.score;
    }
    return 90;
  }

  /**
   * Calculates Size and Structural score S (0–100, 20% weight)
   *   S = 0.40 * L + 0.35 * N + 0.25 * P
   */
  calculateStructuralScore(file) {
    const totalLines = file.totalLines || 0;
    const comp = file.complexitySummary || {};
    const totalFuncs = comp.totalFunctions || 0;
    const functions = file.functions || [];

    let maxFuncLen = 0;
    let maxParams = 0;
    functions.forEach(fn => {
      if (fn.lineCount && fn.lineCount > maxFuncLen) maxFuncLen = fn.lineCount;
      if (fn.parameterCount && fn.parameterCount > maxParams) maxParams = fn.parameterCount;
    });

    const L = this.calculateLengthScore(totalLines, maxFuncLen);
    const N = this.calculateNestingScore(comp.maxNestingDepth || 0, totalFuncs);
    const P = this.calculateParameterScore(maxParams, totalFuncs);

    const wL = this.structuralWeights.length;
    const wN = this.structuralWeights.nesting;
    const wP = this.structuralWeights.parameters;

    const S = parseFloat(((wL * L) + (wN * N) + (wP * P)).toFixed(2));

    return {
      score: S,
      details: {
        lengthScore: L,
        nestingScore: N,
        parameterScore: P,
        weights: { length: wL, nesting: wN, parameters: wP },
        maxFunctionLength: maxFuncLen,
        maxParameterCount: maxParams
      }
    };
  }

  /**
   * Maps numerical risk score (0–100) to severity category
   */
  getSeverity(score) {
    if (score < 25) return SEVERITY_LEVELS.LOW;
    if (score < 50) return SEVERITY_LEVELS.MODERATE;
    if (score < 75) return SEVERITY_LEVELS.HIGH;
    return SEVERITY_LEVELS.CRITICAL;
  }

  /**
   * Computes the Technical Debt Risk Score for a single file using:
   *   R = 0.45 * C + 0.35 * D + 0.20 * S
   */
  scoreFile(file, options = {}) {
    const totalLines = file.totalLines || 0;

    // Edge case: empty or 0-line file
    if (totalLines === 0) {
      return {
        riskScore: 0,
        severity: SEVERITY_LEVELS.LOW,
        remediationPriority: { priority: 'P4', score: 0, label: 'Low' },
        subScores: { complexity: 0, duplication: 0, structural: 0 },
        structuralDetails: { lengthScore: 0, nestingScore: 0, parameterScore: 0 },
        weightsApplied: { complexity: 0.45, duplication: 0.35, structural: 0.20 },
        riskFactors: ['Empty file or non-executable content'],
        contributingMetrics: []
      };
    }

    const comp = file.complexitySummary || {};
    const totalFuncs = comp.totalFunctions || 0;
    const maxComp = comp.maxComplexity || 0;

    // Compute components
    const C = this.calculateComplexityScore(maxComp, totalFuncs);
    const D = this.calculateDuplicationScore(file.duplicatePercentage || 0);
    const structResult = this.calculateStructuralScore(file);
    const S = structResult.score;

    // Active weights (default: C=0.45, D=0.35, S=0.20)
    const activeWeights = {
      complexity: options.weights?.complexity !== undefined ? options.weights.complexity : this.weights.complexity,
      duplication: options.weights?.duplication !== undefined ? options.weights.duplication : this.weights.duplication,
      structural: options.weights?.structural !== undefined ? options.weights.structural : this.weights.structural
    };

    // Calculate R = 0.45*C + 0.35*D + 0.20*S
    const weightedC = parseFloat((activeWeights.complexity * C).toFixed(2));
    const weightedD = parseFloat((activeWeights.duplication * D).toFixed(2));
    const weightedS = parseFloat((activeWeights.structural * S).toFixed(2));

    let R = parseFloat((weightedC + weightedD + weightedS).toFixed(1));
    R = Math.min(100, Math.max(0, R));

    // Contributing metrics breakdown
    const contributingMetrics = [
      {
        dimension: 'complexity',
        rawScore: C,
        activeWeight: activeWeights.complexity,
        weightedPoints: weightedC,
        contributionPercentage: R > 0 ? parseFloat(((weightedC / R) * 100).toFixed(1)) : 0,
        status: 'EVALUATED'
      },
      {
        dimension: 'duplication',
        rawScore: D,
        activeWeight: activeWeights.duplication,
        weightedPoints: weightedD,
        contributionPercentage: R > 0 ? parseFloat(((weightedD / R) * 100).toFixed(1)) : 0,
        status: 'EVALUATED'
      },
      {
        dimension: 'structural',
        rawScore: S,
        activeWeight: activeWeights.structural,
        weightedPoints: weightedS,
        contributionPercentage: R > 0 ? parseFloat(((weightedS / R) * 100).toFixed(1)) : 0,
        status: 'EVALUATED',
        subBreakdown: structResult.details
      }
    ];

    // Sort descending by weighted points
    contributingMetrics.sort((a, b) => b.weightedPoints - a.weightedPoints);

    // Explainable human-readable risk factors
    const riskFactors = this.generateRiskFactors(file, C, D, structResult.details, R);

    // Remediation priority
    const remediationPriority = this.calculateRemediationPriority(file, R);

    return {
      riskScore: R,
      severity: this.getSeverity(R),
      remediationPriority,
      subScores: {
        complexity: C,
        duplication: D,
        structural: S
      },
      structuralDetails: structResult.details,
      weightsApplied: activeWeights,
      riskFactors,
      contributingMetrics
    };
  }

  /**
   * Generates clear, human-understandable explanations for why a file received its score.
   */
  generateRiskFactors(file, C, D, structDetails, totalScore) {
    const factors = [];
    const comp = file.complexitySummary || {};

    if (C >= 65) {
      const worstFunc = (file.functions || []).reduce(
        (prev, curr) => (curr.cyclomaticComplexity > (prev?.cyclomaticComplexity || 0) ? curr : prev),
        null
      );
      const funcName = worstFunc ? `'${worstFunc.name}'` : 'a function';
      factors.push(
        `High cyclomatic complexity: ${funcName} reaches complexity of ${comp.maxComplexity} (complexity score: ${C}/100)`
      );
    } else if (C === 35) {
      factors.push(`Moderate cyclomatic complexity: max complexity is ${comp.maxComplexity} (score: 35/100)`);
    }

    if (D >= 70) {
      factors.push(`Significant code duplication: ${file.duplicatePercentage}% of lines duplicated (duplication score: ${D}/100)`);
    } else if (D >= 40) {
      factors.push(`Moderate code duplication: ${file.duplicatePercentage}% of lines duplicated (score: ${D}/100)`);
    }

    if (structDetails.nestingScore >= 65) {
      factors.push(`Deep nesting depth: control flow reaches ${comp.maxNestingDepth} levels (threshold: >=3)`);
    }

    if (structDetails.lengthScore >= 65) {
      factors.push(`Large file or functions: spans ${file.totalLines} lines (max function length: ${structDetails.maxFunctionLength} lines)`);
    }

    if (structDetails.parameterScore >= 65) {
      factors.push(`High parameter count: functions take up to ${structDetails.maxParameterCount} parameters (threshold: >4)`);
    }

    if (factors.length === 0) {
      if (totalScore < 25) {
        factors.push('Clean code structure: all complexity, duplication, and structural metrics within low-risk thresholds');
      } else {
        factors.push('Cumulative moderate structural debt distributed across multiple metrics');
      }
    }

    return factors;
  }

  /**
   * Calculates Remediation Priority Score:
   *   Priority = (RiskScore * ImpactMultiplier) / EffortFactor
   */
  calculateRemediationPriority(file, riskScore) {
    if (riskScore === 0) {
      return { priority: 'P4', score: 0, label: 'Low' };
    }

    const comp = file.complexitySummary || {};
    const totalLines = file.totalLines || 0;
    const complexCount = comp.complexFunctionCount || 0;
    const totalFuncs = comp.totalFunctions || 0;

    let impactMultiplier = 1.0;
    if (complexCount > 0) impactMultiplier += Math.min(0.3, complexCount * 0.1);
    if (totalFuncs > 5) impactMultiplier += 0.2;

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
          structuralDetails: scoreData.structuralDetails,
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

    // Top hotspots (files with High or Critical severity, or top 10)
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

    // Actionable repository recommendations
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
      activeWeights: scoredFiles[0]?.riskBreakdown?.weightsApplied || this.weights,
      formula: 'R = 0.45*C + 0.35*D + 0.20*S',
      recommendations
    };

    return scanReport;
  }

  generateRepositoryRecommendations(files, distribution) {
    const recs = [];

    if (distribution.CRITICAL > 0) {
      recs.push({
        id: 'REC_CRITICAL_FILES',
        severity: 'CRITICAL',
        title: `Address ${distribution.CRITICAL} Critical-Risk Files Immediately`,
        description: `${distribution.CRITICAL} file(s) exhibit high complexity, duplication, or monolithic structure. Prioritize these in upcoming refactoring sprints.`
      });
    }

    const highDupFiles = files.filter(f => (f.duplicatePercentage || 0) >= 20);
    if (highDupFiles.length > 0) {
      recs.push({
        id: 'REC_CONSOLIDATE_CLONES',
        severity: 'HIGH',
        title: `Extract Shared Logic for ${highDupFiles.length} Highly Duplicated Files`,
        description: `Over 20% of code in ${highDupFiles.length} file(s) consists of cloned blocks. Consolidating repeated patterns into shared modules will reduce maintenance overhead.`
      });
    }

    const complexFuncCount = files.reduce((acc, f) => acc + (f.complexitySummary?.complexFunctionCount || 0), 0);
    if (complexFuncCount > 0) {
      recs.push({
        id: 'REC_DECOMPOSE_FUNCTIONS',
        severity: 'MEDIUM',
        title: `Decompose ${complexFuncCount} Functions with Cyclomatic Complexity > 10`,
        description: `Functions exceeding McCabe complexity 10 require extensive branch testing and are prone to regression. Break them down into smaller helpers.`
      });
    }

    const largeFiles = files.filter(f => (f.totalLines || 0) > 300);
    if (largeFiles.length > 0) {
      recs.push({
        id: 'REC_MODULARIZE_GOD_OBJECTS',
        severity: 'MEDIUM',
        title: `Modularize ${largeFiles.length} Files Exceeding 300 LOC`,
        description: `Large files violate the Single Responsibility Principle. Consider splitting them into focused sub-modules.`
      });
    }

    if (recs.length === 0) {
      recs.push({
        id: 'REC_MAINTAIN_STANDARD',
        severity: 'LOW',
        title: 'Maintain Current High Codebase Health Standards',
        description: 'No severe technical debt hotspots detected. Continue adhering to modular design.'
      });
    }

    return recs;
  }
}

module.exports = new RiskScorer();
module.exports.RiskScorer = RiskScorer;
module.exports.DEFAULT_WEIGHTS = DEFAULT_WEIGHTS;
module.exports.DEFAULT_STRUCTURAL_WEIGHTS = DEFAULT_STRUCTURAL_WEIGHTS;
module.exports.DEFAULT_THRESHOLDS = DEFAULT_THRESHOLDS;
module.exports.SEVERITY_LEVELS = SEVERITY_LEVELS;
