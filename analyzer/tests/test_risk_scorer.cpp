#include "../include/risk_scorer.hpp"
#include "../include/scanner.hpp"

#include <iostream>
#include <cassert>
#include <cmath>

using namespace codeinsight;

void testNormalization() {
    std::cout << "  - Testing normalization curves... ";

    // Complexity normalization tests
    assert(RiskScorer::normalizeMaxComplexity(1) == 0.0);
    assert(RiskScorer::normalizeMaxComplexity(5) == 15.0);
    assert(RiskScorer::normalizeMaxComplexity(10) == 30.0);
    assert(RiskScorer::normalizeMaxComplexity(25) == 70.0);
    assert(RiskScorer::normalizeMaxComplexity(50) == 90.0);
    assert(RiskScorer::normalizeMaxComplexity(100) == 100.0);

    // Nesting depth normalization tests
    assert(RiskScorer::normalizeNestingDepth(1) == 0.0);
    assert(RiskScorer::normalizeNestingDepth(2) == 20.0);
    assert(RiskScorer::normalizeNestingDepth(3) == 40.0);
    assert(RiskScorer::normalizeNestingDepth(4) == 60.0);
    assert(RiskScorer::normalizeNestingDepth(5) == 80.0);
    assert(RiskScorer::normalizeNestingDepth(7) == 100.0);

    // Duplication normalization tests
    assert(RiskScorer::normalizeDuplication(0.0) == 0.0);
    assert(RiskScorer::normalizeDuplication(10.0) == 20.0);
    assert(RiskScorer::normalizeDuplication(30.0) == 55.0);
    assert(RiskScorer::normalizeDuplication(60.0) == 85.0);
    assert(RiskScorer::normalizeDuplication(100.0) == 100.0);

    // Structural normalization tests
    assert(RiskScorer::normalizeStructuralMetrics(0, 0) == 0.0);
    assert(RiskScorer::normalizeStructuralMetrics(100, 80) == 13.5); // 15 * 0.9

    std::cout << "PASSED\n";
}

void testDynamicWeightNormalization() {
    std::cout << "  - Testing dynamic weight redistribution with Phase 5/6 skipped... ";

    RiskScorer scorer;
    FileMetrics file;
    file.relativePath = "src/payment_gateway.cpp";
    file.totalLines = 450;
    file.codeLines = 380;
    file.duplicatePercentage = 50.0; // Substantial duplication
    file.complexity.totalFunctions = 4;
    file.complexity.maxComplexity = 15; // High complexity
    file.complexity.maxNestingDepth = 4;
    file.complexity.complexFunctionCount = 2;

    scorer.scoreFile(file);

    // With dependency (0.20) and churn (0.15) missing:
    // Active weights: complexity 0.30, duplication 0.25, structural 0.10 => Sum = 0.65
    // wComp = 0.30 / 0.65 = 0.4615
    // wDup = 0.25 / 0.65 = 0.3846
    // wStruct = 0.10 / 0.65 = 0.1538
    assert(file.riskBreakdown.weightsApplied["complexity"] >= 0.46 && file.riskBreakdown.weightsApplied["complexity"] <= 0.47);
    assert(file.riskBreakdown.weightsApplied["duplication"] >= 0.38 && file.riskBreakdown.weightsApplied["duplication"] <= 0.39);
    assert(file.riskBreakdown.weightsApplied["structural"] >= 0.15 && file.riskBreakdown.weightsApplied["structural"] <= 0.16);

    // Score should be High (between 50 and 74) or Critical (>= 75)
    assert(file.riskScore >= 50.0);
    assert(file.severity == "HIGH" || file.severity == "CRITICAL");

    // Explainability factors check
    assert(!file.riskBreakdown.riskFactors.empty());
    bool foundCompFactor = false;
    bool foundDupFactor = false;
    for (const auto& factor : file.riskBreakdown.riskFactors) {
        if (factor.find("cyclomatic complexity") != std::string::npos) foundCompFactor = true;
        if (factor.find("duplication") != std::string::npos) foundDupFactor = true;
    }
    assert(foundCompFactor);
    assert(foundDupFactor);

    // Contributing metrics check
    assert(file.riskBreakdown.contributingMetrics.size() == 5);
    bool foundEvaluated = false;
    bool foundSkipped = false;
    for (const auto& cm : file.riskBreakdown.contributingMetrics) {
        if (cm.status == "EVALUATED") foundEvaluated = true;
        if (cm.status == "SKIPPED_OR_MISSING") foundSkipped = true;
    }
    assert(foundEvaluated);
    assert(foundSkipped);

    std::cout << "PASSED (score=" << file.riskScore << ", severity=" << file.severity << ")\n";
}

void testEmptyFileHandling() {
    std::cout << "  - Testing empty file handling... ";

    RiskScorer scorer;
    FileMetrics emptyFile;
    emptyFile.relativePath = "empty.cpp";
    emptyFile.totalLines = 0;

    scorer.scoreFile(emptyFile);

    assert(emptyFile.riskScore == 0.0);
    assert(emptyFile.severity == "LOW");
    assert(emptyFile.remediationPriority.priority == "P4");
    assert(emptyFile.riskBreakdown.riskFactors[0] == "Empty file or non-executable content");

    std::cout << "PASSED\n";
}

int main() {
    std::cout << "[Test Suite] Running CodeInsight Phase 7 Technical Debt Risk Scorer Tests (C++)...\n\n";

    testNormalization();
    testDynamicWeightNormalization();
    testEmptyFileHandling();

    std::cout << "\n[ALL PHASE 7 C++ TESTS PASSED SUCCESSFULLY]\n";
    return 0;
}

