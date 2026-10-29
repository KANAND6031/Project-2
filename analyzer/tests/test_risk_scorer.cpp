#include "../include/risk_scorer.hpp"
#include "../include/scanner.hpp"

#include <cassert>
#include <cmath>
#include <iostream>

using namespace codeinsight;

void testThresholdCalculations() {
  std::cout << "  - Testing threshold mappings for C, D, L, N, P... ";

  // Complexity score C (0, 10, 35, 65, 90)
  assert(RiskScorer::calculateComplexityScore(0, 0) == 0.0);
  assert(RiskScorer::calculateComplexityScore(3, 1) == 10.0);
  assert(RiskScorer::calculateComplexityScore(5, 1) == 10.0);
  assert(RiskScorer::calculateComplexityScore(8, 2) == 35.0);
  assert(RiskScorer::calculateComplexityScore(10, 2) == 35.0);
  assert(RiskScorer::calculateComplexityScore(12, 1) == 65.0);
  assert(RiskScorer::calculateComplexityScore(15, 1) == 65.0);
  assert(RiskScorer::calculateComplexityScore(20, 1) == 90.0);

  // Duplication score D (0, 20, 40, 70, 90)
  assert(RiskScorer::calculateDuplicationScore(0.0) == 0.0);
  assert(RiskScorer::calculateDuplicationScore(4.0) == 20.0);
  assert(RiskScorer::calculateDuplicationScore(5.0) == 20.0);
  assert(RiskScorer::calculateDuplicationScore(8.0) == 40.0);
  assert(RiskScorer::calculateDuplicationScore(10.0) == 40.0);
  assert(RiskScorer::calculateDuplicationScore(15.0) == 70.0);
  assert(RiskScorer::calculateDuplicationScore(20.0) == 70.0);
  assert(RiskScorer::calculateDuplicationScore(35.0) == 90.0);

  // Length score L
  assert(RiskScorer::calculateLengthScore(0, 0) == 0.0);
  assert(RiskScorer::calculateLengthScore(50, 20) == 10.0);
  assert(RiskScorer::calculateLengthScore(200, 45) == 35.0);
  assert(RiskScorer::calculateLengthScore(500, 80) == 65.0);
  assert(RiskScorer::calculateLengthScore(1000, 150) == 90.0);

  // Nesting score N
  assert(RiskScorer::calculateNestingScore(1, 1) == 10.0);
  assert(RiskScorer::calculateNestingScore(2, 1) == 35.0);
  assert(RiskScorer::calculateNestingScore(3, 1) == 65.0);
  assert(RiskScorer::calculateNestingScore(4, 1) == 90.0);

  // Parameter score P
  assert(RiskScorer::calculateParameterScore(2, 1) == 10.0);
  assert(RiskScorer::calculateParameterScore(4, 1) == 35.0);
  assert(RiskScorer::calculateParameterScore(6, 1) == 65.0);
  assert(RiskScorer::calculateParameterScore(8, 1) == 90.0);

  std::cout << "PASSED\n";
}

void testRiskFormulaCalculation() {
  std::cout << "  - Testing R = 0.45*C + 0.35*D + 0.20*S formula... ";

  RiskScorer scorer;
  FileMetrics file;
  file.relativePath = "src/payment_gateway.cpp";
  file.totalLines = 450;           // L = 65 (between 300 and 700)
  file.duplicatePercentage = 15.0; // D = 70 (between 11% and 20%)
  file.complexity.totalFunctions = 2;
  file.complexity.maxComplexity = 14;  // C = 65 (between 11 and 15)
  file.complexity.maxNestingDepth = 3; // N = 65 (depth 3)

  FunctionMetrics fn1;
  fn1.name = "process";
  fn1.lineCount = 80;
  fn1.parameterCount = 4; // P = 35 (max params 4)
  fn1.cyclomaticComplexity = 14;
  file.complexity.functions.push_back(fn1);

  scorer.scoreFile(file);

  // S = 0.40*L + 0.35*N + 0.25*P
  // S = 0.40*(65) + 0.35*(65) + 0.25*(35) = 26.0 + 22.75 + 8.75 = 57.5
  // R = 0.45*(65) + 0.35*(70) + 0.20*(57.5) = 29.25 + 24.50 + 11.50 = 65.25
  // -> 65.3
  assert(file.riskBreakdown.subScores.complexity == 65.0);
  assert(file.riskBreakdown.subScores.duplication == 70.0);
  assert(file.riskBreakdown.subScores.structural == 57.5);
  assert(std::abs(file.riskScore - 65.3) < 0.1);
  assert(file.severity == "HIGH");

  // Explainability checks
  assert(!file.riskBreakdown.riskFactors.empty());
  assert(file.riskBreakdown.contributingMetrics.size() == 3);

  std::cout << "PASSED (R=" << file.riskScore << ", Severity=" << file.severity
            << ")\n";
}

void testEmptyFile() {
  std::cout << "  - Testing empty file handling... ";

  RiskScorer scorer;
  FileMetrics emptyFile;
  emptyFile.relativePath = "empty.cpp";
  emptyFile.totalLines = 0;

  scorer.scoreFile(emptyFile);

  assert(emptyFile.riskScore == 0.0);
  assert(emptyFile.severity == "LOW");
  assert(emptyFile.remediationPriority.priority == "P4");
  assert(emptyFile.riskBreakdown.riskFactors[0] ==
         "Empty file or non-executable content");

  std::cout << "PASSED\n";
}

int main() {
  std::cout << "[Test Suite] Running CodeInsight Phase 7 R=0.45C+0.35D+0.20S "
               "Tests (C++)...\n\n";

  testThresholdCalculations();
  testRiskFormulaCalculation();
  testEmptyFile();

  std::cout << "\n[ALL PHASE 7 C++ TESTS PASSED SUCCESSFULLY]\n";
  return 0;
}
