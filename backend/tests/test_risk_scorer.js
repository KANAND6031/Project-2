/**
 * CodeInsight Phase 7 Test Suite
 * Technical Debt Risk Scoring & Explainability Engine
 */

const assert = require('assert');
const path = require('path');
const riskScorer = require('../src/services/riskScorer');
const analyzerService = require('../src/services/analyzerService');

console.log('[Test Suite] Running CodeInsight Phase 7 Technical Debt Risk Scorer Tests (Node.js)...\n');

// 1. Normalization Curves
{
  process.stdout.write('  - Testing normalization curves for all dimensions... ');

  // Cyclomatic Complexity normalization
  assert.strictEqual(riskScorer.normalizeMaxComplexity(1), 0);
  assert.strictEqual(riskScorer.normalizeMaxComplexity(5), 15);
  assert.strictEqual(riskScorer.normalizeMaxComplexity(10), 30);
  assert.strictEqual(riskScorer.normalizeMaxComplexity(25), 70);
  assert.strictEqual(riskScorer.normalizeMaxComplexity(50), 90);
  assert.strictEqual(riskScorer.normalizeMaxComplexity(100), 100);

  // Nesting Depth normalization
  assert.strictEqual(riskScorer.normalizeNestingDepth(1), 0);
  assert.strictEqual(riskScorer.normalizeNestingDepth(2), 20);
  assert.strictEqual(riskScorer.normalizeNestingDepth(3), 40);
  assert.strictEqual(riskScorer.normalizeNestingDepth(4), 60);
  assert.strictEqual(riskScorer.normalizeNestingDepth(5), 80);
  assert.strictEqual(riskScorer.normalizeNestingDepth(7), 100);

  // Duplication normalization
  assert.strictEqual(riskScorer.normalizeDuplication(0), 0);
  assert.strictEqual(riskScorer.normalizeDuplication(10), 20);
  assert.strictEqual(riskScorer.normalizeDuplication(30), 55);
  assert.strictEqual(riskScorer.normalizeDuplication(60), 85);
  assert.strictEqual(riskScorer.normalizeDuplication(100), 100);

  // Structural Metrics normalization
  assert.strictEqual(riskScorer.normalizeStructuralMetrics(0, 0), 0);
  assert.strictEqual(riskScorer.normalizeStructuralMetrics(100, 80), 13.5); // (15 * 0.9)
  assert(riskScorer.normalizeStructuralMetrics(500, 80) >= 45);

  console.log('PASSED');
}

// 2. Dynamic Weight Redistribution (Phase 5 & 6 Skipped)
{
  process.stdout.write('  - Testing dynamic weight redistribution when Phase 5/6 metrics are omitted... ');

  const mockFile = {
    relativePath: 'src/services/paymentProcessor.js',
    totalLines: 420,
    codeLines: 360,
    maxLineLength: 95,
    duplicatePercentage: 45,
    complexitySummary: {
      totalFunctions: 5,
      maxComplexity: 16,
      maxNestingDepth: 4,
      complexFunctionCount: 2
    },
    functions: [
      { name: 'processPayment', cyclomaticComplexity: 16 }
    ]
  };

  const result = riskScorer.scoreFile(mockFile);

  // Total active weight sum = 0.30 (comp) + 0.25 (dup) + 0.10 (struct) = 0.65
  // wComp = 0.30 / 0.65 = 0.4615
  // wDup  = 0.25 / 0.65 = 0.3846
  // wStruct = 0.10 / 0.65 = 0.1538
  const w = result.weightsApplied;
  assert(Math.abs(w.complexity - 0.4615) < 0.001, `Complexity weight was ${w.complexity}, expected ~0.4615`);
  assert(Math.abs(w.duplication - 0.3846) < 0.001, `Duplication weight was ${w.duplication}, expected ~0.3846`);
  assert(Math.abs(w.structural - 0.1538) < 0.001, `Structural weight was ${w.structural}, expected ~0.1538`);

  // Risk score should be High
  assert(result.riskScore >= 50 && result.riskScore < 75, `Expected High score (50-74), got ${result.riskScore}`);
  assert.strictEqual(result.severity, 'HIGH');

  // Verify contributing metrics breakdown
  assert.strictEqual(result.contributingMetrics.length, 5);
  const evalMetrics = result.contributingMetrics.filter(m => m.status === 'EVALUATED');
  const skippedMetrics = result.contributingMetrics.filter(m => m.status === 'SKIPPED_OR_MISSING');

  assert.strictEqual(evalMetrics.length, 3);
  assert.strictEqual(skippedMetrics.length, 2);

  // Sum of contribution percentages should equal ~100%
  const totalContribution = evalMetrics.reduce((sum, m) => sum + m.contributionPercentage, 0);
  assert(Math.abs(totalContribution - 100) < 1.0, `Total contribution was ${totalContribution}%, expected ~100%`);

  console.log(`PASSED (Score: ${result.riskScore}, Severity: ${result.severity})`);
}

// 3. Explainability Engine & Risk Factors
{
  process.stdout.write('  - Testing explainable human-readable risk factors generation... ');

  const highDebtFile = {
    relativePath: 'legacy/monolith.cpp',
    totalLines: 1200,
    maxLineLength: 220,
    duplicatePercentage: 65,
    complexitySummary: {
      totalFunctions: 12,
      maxComplexity: 28,
      maxNestingDepth: 5,
      complexFunctionCount: 4
    },
    functions: [
      { name: 'dispatchOrder', cyclomaticComplexity: 28 }
    ]
  };

  const scored = riskScorer.scoreFile(highDebtFile);
  assert(scored.riskScore >= 75, `Monolith file should be CRITICAL (>=75), got ${scored.riskScore}`);
  assert.strictEqual(scored.severity, 'CRITICAL');

  // Check specific risk factors
  const factors = scored.riskFactors;
  assert(factors.some(f => f.includes('dispatchOrder') && f.includes('28')), 'Should mention worst function');
  assert(factors.some(f => f.includes('Deep nesting depth') && f.includes('5 levels')), 'Should mention deep nesting');
  assert(factors.some(f => f.includes('Significant code duplication') && f.includes('65%')), 'Should mention duplication');
  assert(factors.some(f => f.includes('Large file size') && f.includes('1200')), 'Should mention large file size');
  assert(factors.some(f => f.includes('Excessive line length')), 'Should mention line length > 200');

  // Remediation Priority should be P1 Urgent
  assert.strictEqual(scored.remediationPriority.priority, 'P1');
  assert.strictEqual(scored.remediationPriority.label, 'Urgent');

  console.log(`PASSED (${factors.length} explicit risk factors generated, Priority: P1 Urgent)`);
}

// 4. Edge Cases: Empty file, Clean file, Custom Weights
{
  process.stdout.write('  - Testing edge cases (empty file, clean file, custom weights)... ');

  // Empty file
  const empty = riskScorer.scoreFile({ totalLines: 0 });
  assert.strictEqual(empty.riskScore, 0);
  assert.strictEqual(empty.severity, 'LOW');
  assert.strictEqual(empty.remediationPriority.priority, 'P4');
  assert.strictEqual(empty.riskFactors[0], 'Empty file or non-executable content');

  // Clean file
  const clean = riskScorer.scoreFile({
    totalLines: 45,
    maxLineLength: 60,
    duplicatePercentage: 0,
    complexitySummary: { totalFunctions: 2, maxComplexity: 2, maxNestingDepth: 1, complexFunctionCount: 0 }
  });
  assert(clean.riskScore < 15, `Clean file should have low score, got ${clean.riskScore}`);
  assert.strictEqual(clean.severity, 'LOW');
  assert.strictEqual(clean.remediationPriority.priority, 'P4');
  assert(clean.riskFactors[0].includes('Clean code structure'));

  // Custom weights override
  const customScored = riskScorer.scoreFile({
    totalLines: 100,
    duplicatePercentage: 80,
    complexitySummary: { totalFunctions: 1, maxComplexity: 1 }
  }, {
    weights: { duplication: 0.90, complexity: 0.05, structural: 0.05 }
  });
  // Since duplication weight is 90%, score should be heavily dominated by duplication
  assert(customScored.riskScore > 70, `With 90% duplication weight, score should be >70, got ${customScored.riskScore}`);

  console.log('PASSED');
}

// 5. End-to-End Scan & Repository Technical Debt Aggregation
(async () => {
  process.stdout.write('  - Testing end-to-end repository scan with technical debt rollup... ');

  const fixtureDir = path.resolve(__dirname, '../../test-fixtures/complex-repo');
  const report = await analyzerService.runScan(fixtureDir);

  // Verify technical debt rollup is present
  assert(report.technicalDebt, 'Report must contain technicalDebt object');
  const debt = report.technicalDebt;

  assert(typeof debt.repositoryRiskScore === 'number', 'repositoryRiskScore must be a number');
  assert(typeof debt.unweightedAverageRisk === 'number', 'unweightedAverageRisk must be a number');
  assert(['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].includes(debt.overallSeverity), 'overallSeverity must be valid');

  // Verify distribution
  assert(debt.riskDistribution.LOW !== undefined, 'riskDistribution must contain LOW');
  assert(debt.riskDistribution.MODERATE !== undefined, 'riskDistribution must contain MODERATE');
  assert(debt.riskDistribution.HIGH !== undefined, 'riskDistribution must contain HIGH');
  assert(debt.riskDistribution.CRITICAL !== undefined, 'riskDistribution must contain CRITICAL');

  // Verify recommendations
  assert(Array.isArray(debt.recommendations), 'recommendations must be an array');
  assert(debt.recommendations.length > 0, 'must have at least one recommendation');

  // Verify files have risk scores
  for (const file of report.files) {
    assert(typeof file.riskScore === 'number', `File ${file.relativePath} missing riskScore`);
    assert(file.severity, `File ${file.relativePath} missing severity`);
    assert(file.riskBreakdown, `File ${file.relativePath} missing riskBreakdown`);
    assert(file.remediationPriority, `File ${file.relativePath} missing remediationPriority`);
  }

  // complex_functions.cpp has max complexity 11 and nesting 4, so it should have elevated risk
  const complexFile = report.files.find(f => f.relativePath.includes('complex_functions.cpp'));
  assert(complexFile, 'complex_functions.cpp must be analyzed');
  assert(complexFile.riskScore > 20, `complex_functions.cpp score was ${complexFile.riskScore}, expected >20`);

  console.log(`PASSED (Repo Risk: ${debt.repositoryRiskScore}, Severity: ${debt.overallSeverity}, Recs: ${debt.recommendations.length})`);

  console.log('\n[ALL PHASE 7 TESTS PASSED SUCCESSFULLY]\n');
})().catch(err => {
  console.error('\n[TEST FAILED]:', err);
  process.exit(1);
});

