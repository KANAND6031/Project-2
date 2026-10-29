/**
 * CodeInsight Phase 7 Test Suite
 * Technical Debt Risk Scorer: R = 0.45*C + 0.35*D + 0.20*S
 */

const assert = require('assert');
const path = require('path');
const riskScorer = require('../src/services/riskScorer');
const analyzerService = require('../src/services/analyzerService');

console.log('[Test Suite] Running CodeInsight Phase 7 R = 0.45*C + 0.35*D + 0.20*S Tests (Node.js)...\n');

// 1. Threshold Mappings
{
  process.stdout.write('  - Testing threshold mappings for C, D, L, N, P... ');

  // Complexity score C
  assert.strictEqual(riskScorer.calculateComplexityScore(0, 0), 0);
  assert.strictEqual(riskScorer.calculateComplexityScore(3, 1), 10);
  assert.strictEqual(riskScorer.calculateComplexityScore(5, 1), 10);
  assert.strictEqual(riskScorer.calculateComplexityScore(8, 2), 35);
  assert.strictEqual(riskScorer.calculateComplexityScore(10, 2), 35);
  assert.strictEqual(riskScorer.calculateComplexityScore(12, 1), 65);
  assert.strictEqual(riskScorer.calculateComplexityScore(15, 1), 65);
  assert.strictEqual(riskScorer.calculateComplexityScore(20, 1), 90);

  // Duplication score D
  assert.strictEqual(riskScorer.calculateDuplicationScore(0), 0);
  assert.strictEqual(riskScorer.calculateDuplicationScore(4), 20);
  assert.strictEqual(riskScorer.calculateDuplicationScore(5), 20);
  assert.strictEqual(riskScorer.calculateDuplicationScore(8), 40);
  assert.strictEqual(riskScorer.calculateDuplicationScore(10), 40);
  assert.strictEqual(riskScorer.calculateDuplicationScore(15), 70);
  assert.strictEqual(riskScorer.calculateDuplicationScore(20), 70);
  assert.strictEqual(riskScorer.calculateDuplicationScore(30), 90);

  // Length score L
  assert.strictEqual(riskScorer.calculateLengthScore(0, 0), 0);
  assert.strictEqual(riskScorer.calculateLengthScore(50, 20), 10);
  assert.strictEqual(riskScorer.calculateLengthScore(200, 45), 35);
  assert.strictEqual(riskScorer.calculateLengthScore(500, 80), 65);
  assert.strictEqual(riskScorer.calculateLengthScore(1000, 150), 90);

  // Nesting score N
  assert.strictEqual(riskScorer.calculateNestingScore(1, 1), 10);
  assert.strictEqual(riskScorer.calculateNestingScore(2, 1), 35);
  assert.strictEqual(riskScorer.calculateNestingScore(3, 1), 65);
  assert.strictEqual(riskScorer.calculateNestingScore(4, 1), 90);

  // Parameter score P
  assert.strictEqual(riskScorer.calculateParameterScore(2, 1), 10);
  assert.strictEqual(riskScorer.calculateParameterScore(4, 1), 35);
  assert.strictEqual(riskScorer.calculateParameterScore(6, 1), 65);
  assert.strictEqual(riskScorer.calculateParameterScore(8, 1), 90);

  console.log('PASSED');
}

// 2. Structural Score S = 0.40*L + 0.35*N + 0.25*P
{
  process.stdout.write('  - Testing S = 0.40*L + 0.35*N + 0.25*P... ');

  const mockFile = {
    totalLines: 450, // L = 65
    complexitySummary: {
      totalFunctions: 2,
      maxNestingDepth: 3 // N = 65
    },
    functions: [
      { lineCount: 80, parameterCount: 4 } // P = 35
    ]
  };

  const struct = riskScorer.calculateStructuralScore(mockFile);
  assert.strictEqual(struct.details.lengthScore, 65);
  assert.strictEqual(struct.details.nestingScore, 65);
  assert.strictEqual(struct.details.parameterScore, 35);
  // S = 0.40*65 + 0.35*65 + 0.25*35 = 26.0 + 22.75 + 8.75 = 57.5
  assert.strictEqual(struct.score, 57.5);

  console.log('PASSED (S = 57.5)');
}

// 3. Overall Risk Formula: R = 0.45*C + 0.35*D + 0.20*S
{
  process.stdout.write('  - Testing R = 0.45*C + 0.35*D + 0.20*S formula evaluation... ');

  const highRiskFile = {
    relativePath: 'src/services/billingService.js',
    totalLines: 450, // L = 65
    duplicatePercentage: 15, // D = 70
    complexitySummary: {
      totalFunctions: 2,
      maxComplexity: 14, // C = 65
      maxNestingDepth: 3, // N = 65
      complexFunctionCount: 1
    },
    functions: [
      { name: 'calculateInvoice', lineCount: 80, parameterCount: 4, cyclomaticComplexity: 14 } // P = 35
    ]
  };

  const result = riskScorer.scoreFile(highRiskFile);

  // C = 65, D = 70, S = 57.5
  // R = 0.45*(65) + 0.35*(70) + 0.20*(57.5) = 29.25 + 24.50 + 11.50 = 65.25 -> 65.3
  assert.strictEqual(result.subScores.complexity, 65);
  assert.strictEqual(result.subScores.duplication, 70);
  assert.strictEqual(result.subScores.structural, 57.5);
  assert.strictEqual(result.riskScore, 65.3);
  assert.strictEqual(result.severity, 'HIGH');

  // Verify weights applied
  assert.strictEqual(result.weightsApplied.complexity, 0.45);
  assert.strictEqual(result.weightsApplied.duplication, 0.35);
  assert.strictEqual(result.weightsApplied.structural, 0.20);

  // Verify contributing metrics breakdown
  assert.strictEqual(result.contributingMetrics.length, 3);
  const totalPoints = result.contributingMetrics.reduce((sum, m) => sum + m.weightedPoints, 0);
  assert(Math.abs(totalPoints - 65.25) < 0.1, `Points were ${totalPoints}, expected ~65.25`);

  console.log(`PASSED (R = ${result.riskScore}, Severity = ${result.severity})`);
}

// 4. Explainable Human-Readable Risk Factors
{
  process.stdout.write('  - Testing explainable risk factors generation... ');

  const criticalFile = {
    relativePath: 'legacy/engine.cpp',
    totalLines: 850,
    duplicatePercentage: 25,
    complexitySummary: {
      totalFunctions: 8,
      maxComplexity: 22,
      maxNestingDepth: 4,
      complexFunctionCount: 3
    },
    functions: [
      { name: 'executeOrderLoop', lineCount: 140, parameterCount: 5, cyclomaticComplexity: 22 }
    ]
  };

  const scored = riskScorer.scoreFile(criticalFile);
  // C = 90, D = 90, S: L=90, N=90, P=65 => S = 0.40*90 + 0.35*90 + 0.25*65 = 36 + 31.5 + 16.25 = 83.75
  // R = 0.45*90 + 0.35*90 + 0.20*83.75 = 40.5 + 31.5 + 16.75 = 88.75 -> 88.8
  assert.strictEqual(scored.severity, 'CRITICAL');
  assert(scored.riskScore >= 75);

  const factors = scored.riskFactors;
  assert(factors.some(f => f.includes('executeOrderLoop') && f.includes('22')), 'Must mention worst function');
  assert(factors.some(f => f.includes('Significant code duplication') && f.includes('25%')), 'Must mention duplication');
  assert(factors.some(f => f.includes('Deep nesting depth') && f.includes('4 levels')), 'Must mention deep nesting');
  assert(factors.some(f => f.includes('Large file or functions')), 'Must mention large file');

  console.log(`PASSED (${factors.length} explicit factors generated)`);
}

// 5. Edge Cases (Empty File & Clean File)
{
  process.stdout.write('  - Testing edge cases (empty file & clean file)... ');

  const empty = riskScorer.scoreFile({ totalLines: 0 });
  assert.strictEqual(empty.riskScore, 0);
  assert.strictEqual(empty.severity, 'LOW');
  assert.strictEqual(empty.remediationPriority.priority, 'P4');

  const clean = riskScorer.scoreFile({
    totalLines: 40,
    duplicatePercentage: 0,
    complexitySummary: { totalFunctions: 1, maxComplexity: 2, maxNestingDepth: 1, complexFunctionCount: 0 },
    functions: [{ name: 'add', lineCount: 10, parameterCount: 2, cyclomaticComplexity: 2 }]
  });
  // C=10, D=0, S: L=10, N=10, P=10 => S=10
  // R = 0.45*10 + 0.35*0 + 0.20*10 = 4.5 + 2.0 = 6.5
  assert.strictEqual(clean.riskScore, 6.5);
  assert.strictEqual(clean.severity, 'LOW');
  assert.strictEqual(clean.remediationPriority.priority, 'P4');

  console.log('PASSED');
}

// 6. End-to-End Scan & Repository Technical Debt Rollup
(async () => {
  process.stdout.write('  - Testing end-to-end repository scan with technical debt rollup... ');

  const fixtureDir = path.resolve(__dirname, '../../test-fixtures/complex-repo');
  const report = await analyzerService.runScan(fixtureDir);

  assert(report.technicalDebt, 'Report must contain technicalDebt object');
  const debt = report.technicalDebt;

  assert.strictEqual(debt.formula, 'R = 0.45*C + 0.35*D + 0.20*S');
  assert(typeof debt.repositoryRiskScore === 'number');
  assert(typeof debt.unweightedAverageRisk === 'number');
  assert(['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].includes(debt.overallSeverity));

  for (const file of report.files) {
    assert(typeof file.riskScore === 'number');
    assert(file.severity);
    assert(file.riskBreakdown);
    assert(file.riskBreakdown.subScores);
    assert(file.riskBreakdown.structuralDetails);
  }

  console.log(`PASSED (Repo Risk: ${debt.repositoryRiskScore}, Formula: ${debt.formula})`);

  console.log('\n[ALL PHASE 7 TESTS PASSED SUCCESSFULLY]\n');
})().catch(err => {
  console.error('\n[TEST FAILED]:', err);
  process.exit(1);
});
