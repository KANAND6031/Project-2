#include "../include/risk_scorer.hpp"
#include "../include/scanner.hpp"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>

namespace codeinsight {

namespace {

// Helper to round double to 1 decimal place
double round1(double val) {
    return std::round(val * 10.0) / 10.0;
}

// Helper to round double to 2 decimal places
double round2(double val) {
    return std::round(val * 100.0) / 100.0;
}

} // namespace

RiskScorer::RiskScorer(const RiskWeights& weights)
    : defaultWeights_(weights) {}

double RiskScorer::normalizeMaxComplexity(size_t maxComplexity) {
    if (maxComplexity <= 1) return 0.0;
    if (maxComplexity <= 10) {
        return round2((static_cast<double>(maxComplexity) / 10.0) * 30.0);
    }
    if (maxComplexity <= 25) {
        return round2(30.0 + ((static_cast<double>(maxComplexity) - 10.0) / 15.0) * 40.0);
    }
    if (maxComplexity <= 50) {
        return round2(70.0 + ((static_cast<double>(maxComplexity) - 25.0) / 25.0) * 20.0);
    }
    return std::min(100.0, round2(90.0 + ((static_cast<double>(maxComplexity) - 50.0) / 50.0) * 10.0));
}

double RiskScorer::normalizeNestingDepth(size_t maxNestingDepth) {
    if (maxNestingDepth <= 1) return 0.0;
    if (maxNestingDepth <= 3) {
        return round2(((static_cast<double>(maxNestingDepth) - 1.0) / 2.0) * 40.0);
    }
    if (maxNestingDepth <= 5) {
        return round2(40.0 + ((static_cast<double>(maxNestingDepth) - 3.0) / 2.0) * 40.0);
    }
    return std::min(100.0, round2(80.0 + (static_cast<double>(maxNestingDepth) - 5.0) * 10.0));
}

double RiskScorer::normalizeDuplication(double dupPercentage) {
    if (dupPercentage <= 0.0) return 0.0;
    double pct = std::min(100.0, dupPercentage);
    if (pct <= 10.0) {
        return round2((pct / 10.0) * 20.0);
    }
    if (pct <= 30.0) {
        return round2(20.0 + ((pct - 10.0) / 20.0) * 35.0);
    }
    if (pct <= 60.0) {
        return round2(55.0 + ((pct - 30.0) / 30.0) * 30.0);
    }
    return std::min(100.0, round2(85.0 + ((pct - 60.0) / 40.0) * 15.0));
}

double RiskScorer::normalizeStructuralMetrics(size_t totalLines, size_t maxLineLength) {
    if (totalLines == 0) return 0.0;

    double loc = static_cast<double>(totalLines);
    double locScore = 0.0;
    if (loc <= 100.0) {
        locScore = (loc / 100.0) * 15.0;
    } else if (loc <= 300.0) {
        locScore = 15.0 + ((loc - 100.0) / 200.0) * 20.0;
    } else if (loc <= 750.0) {
        locScore = 35.0 + ((loc - 300.0) / 450.0) * 35.0;
    } else if (loc <= 1500.0) {
        locScore = 70.0 + ((loc - 750.0) / 750.0) * 20.0;
    } else {
        locScore = std::min(100.0, 90.0 + ((loc - 1500.0) / 1500.0) * 10.0);
    }

    double linePenalty = 0.0;
    if (maxLineLength > 150) {
        linePenalty = std::min(10.0, ((static_cast<double>(maxLineLength) - 150.0) / 150.0) * 10.0);
    }

    return std::min(100.0, round2((locScore * 0.9) + linePenalty));
}

std::string RiskScorer::getSeverityLabel(double score) {
    if (score < 25.0) return "LOW";
    if (score < 50.0) return "MODERATE";
    if (score < 75.0) return "HIGH";
    return "CRITICAL";
}

void RiskScorer::scoreFile(FileMetrics& file, const RiskWeights* customWeights) const {
    const RiskWeights& weights = customWeights ? *customWeights : defaultWeights_;

    if (file.totalLines == 0) {
        file.riskScore = 0.0;
        file.severity = "LOW";
        file.remediationPriority = {"P4", 0.0, "Low", 1.0, 1.0};
        file.riskBreakdown = {};
        file.riskBreakdown.riskFactors.push_back("Empty file or non-executable content");
        return;
    }

    // Complexity dimension
    double compMaxScore = normalizeMaxComplexity(file.complexity.maxComplexity);
    double compNestingScore = normalizeNestingDepth(file.complexity.maxNestingDepth);
    double complexitySubScore = 0.0;

    if (file.complexity.totalFunctions > 0) {
        complexitySubScore = (compMaxScore * 0.65) + (compNestingScore * 0.35);
        if (file.complexity.complexFunctionCount > 1) {
            double densityBonus = std::min(15.0, (file.complexity.complexFunctionCount - 1) * 3.0);
            complexitySubScore += densityBonus;
        }
        complexitySubScore = std::min(100.0, round2(complexitySubScore));
    }

    // Duplication dimension
    double duplicationSubScore = normalizeDuplication(file.duplicatePercentage);

    // Structural dimension
    double structuralSubScore = normalizeStructuralMetrics(file.totalLines, file.maxLineLength);

    // Active dimensions & weight re-normalization (Phase 5 dependency & Phase 6 churn skipped)
    double sumActiveWeights = weights.complexity + weights.duplication + weights.structural;
    double wComp = sumActiveWeights > 0 ? (weights.complexity / sumActiveWeights) : 0.0;
    double wDup = sumActiveWeights > 0 ? (weights.duplication / sumActiveWeights) : 0.0;
    double wStruct = sumActiveWeights > 0 ? (weights.structural / sumActiveWeights) : 0.0;

    double weightedPointsComp = round2(complexitySubScore * wComp);
    double weightedPointsDup = round2(duplicationSubScore * wDup);
    double weightedPointsStruct = round2(structuralSubScore * wStruct);

    double totalScore = round1(weightedPointsComp + weightedPointsDup + weightedPointsStruct);
    totalScore = std::min(100.0, std::max(0.0, totalScore));

    file.riskScore = totalScore;
    file.severity = getSeverityLabel(totalScore);

    // Populate breakdown
    FileRiskBreakdown breakdown;
    breakdown.subScores.complexity = complexitySubScore;
    breakdown.subScores.duplication = duplicationSubScore;
    breakdown.subScores.structural = structuralSubScore;
    breakdown.subScores.hasDependency = false;
    breakdown.subScores.dependency = 0.0;
    breakdown.subScores.hasChurn = false;
    breakdown.subScores.churn = 0.0;

    breakdown.weightsApplied["complexity"] = round2(wComp);
    breakdown.weightsApplied["duplication"] = round2(wDup);
    breakdown.weightsApplied["structural"] = round2(wStruct);

    // Contributing metrics
    ContributingMetric cmComp;
    cmComp.dimension = "complexity";
    cmComp.hasRawScore = true;
    cmComp.rawScore = complexitySubScore;
    cmComp.activeWeight = round2(wComp);
    cmComp.weightedPoints = weightedPointsComp;
    cmComp.contributionPercentage = totalScore > 0 ? round1((weightedPointsComp / totalScore) * 100.0) : 0.0;
    cmComp.status = "EVALUATED";
    breakdown.contributingMetrics.push_back(cmComp);

    ContributingMetric cmDup;
    cmDup.dimension = "duplication";
    cmDup.hasRawScore = true;
    cmDup.rawScore = duplicationSubScore;
    cmDup.activeWeight = round2(wDup);
    cmDup.weightedPoints = weightedPointsDup;
    cmDup.contributionPercentage = totalScore > 0 ? round1((weightedPointsDup / totalScore) * 100.0) : 0.0;
    cmDup.status = "EVALUATED";
    breakdown.contributingMetrics.push_back(cmDup);

    ContributingMetric cmStruct;
    cmStruct.dimension = "structural";
    cmStruct.hasRawScore = true;
    cmStruct.rawScore = structuralSubScore;
    cmStruct.activeWeight = round2(wStruct);
    cmStruct.weightedPoints = weightedPointsStruct;
    cmStruct.contributionPercentage = totalScore > 0 ? round1((weightedPointsStruct / totalScore) * 100.0) : 0.0;
    cmStruct.status = "EVALUATED";
    breakdown.contributingMetrics.push_back(cmStruct);

    ContributingMetric cmDep;
    cmDep.dimension = "dependency";
    cmDep.hasRawScore = false;
    cmDep.rawScore = 0.0;
    cmDep.activeWeight = 0.0;
    cmDep.weightedPoints = 0.0;
    cmDep.contributionPercentage = 0.0;
    cmDep.status = "SKIPPED_OR_MISSING";
    breakdown.contributingMetrics.push_back(cmDep);

    ContributingMetric cmChurn;
    cmChurn.dimension = "churn";
    cmChurn.hasRawScore = false;
    cmChurn.rawScore = 0.0;
    cmChurn.activeWeight = 0.0;
    cmChurn.weightedPoints = 0.0;
    cmChurn.contributionPercentage = 0.0;
    cmChurn.status = "SKIPPED_OR_MISSING";
    breakdown.contributingMetrics.push_back(cmChurn);

    // Sort evaluated metrics descending by points
    std::sort(breakdown.contributingMetrics.begin(), breakdown.contributingMetrics.end(),
              [](const ContributingMetric& a, const ContributingMetric& b) {
                  return a.weightedPoints > b.weightedPoints;
              });

    breakdown.riskFactors = generateRiskFactors(file, totalScore);
    file.riskBreakdown = breakdown;
    file.remediationPriority = calculateRemediationPriority(file, totalScore);
}

std::vector<std::string> RiskScorer::generateRiskFactors(const FileMetrics& file, double totalScore) const {
    std::vector<std::string> factors;

    if (file.complexity.maxComplexity > 10) {
        std::string worstName = "a function";
        for (const auto& fn : file.complexity.functions) {
            if (fn.cyclomaticComplexity == file.complexity.maxComplexity) {
                worstName = "'" + fn.name + "'";
                break;
            }
        }
        factors.push_back("High cyclomatic complexity: " + worstName +
                          " reaches McCabe complexity of " + std::to_string(file.complexity.maxComplexity) +
                          " (threshold: >10)");
    }

    if (file.complexity.maxNestingDepth >= 4) {
        factors.push_back("Deep nesting depth: control-flow indents to " +
                          std::to_string(file.complexity.maxNestingDepth) +
                          " levels (threshold: >=4)");
    }

    if (file.complexity.complexFunctionCount > 1) {
        factors.push_back("High complexity density: " +
                          std::to_string(file.complexity.complexFunctionCount) +
                          " functions exceed acceptable McCabe thresholds");
    }

    if (file.duplicatePercentage >= 20.0) {
        std::ostringstream ss;
        ss << std::fixed << std::setprecision(1) << file.duplicatePercentage;
        factors.push_back("Significant code duplication: " + ss.str() +
                          "% of lines are identical duplicate blocks");
    }

    if (file.totalLines > 500) {
        factors.push_back("Large file size: " + std::to_string(file.totalLines) +
                          " lines of code indicates poor modularity / God-object risk (threshold: >500 LOC)");
    }

    if (file.maxLineLength > 200) {
        factors.push_back("Excessive line length: maximum line spans " +
                          std::to_string(file.maxLineLength) +
                          " characters (threshold: >200 chars)");
    }

    if (factors.empty()) {
        if (totalScore < 25.0) {
            factors.push_back("Clean code structure: all metrics within recommended thresholds");
        } else {
            factors.push_back("Moderate cumulative structural debt distributed across multiple metrics");
        }
    }

    return factors;
}

RemediationPriority RiskScorer::calculateRemediationPriority(const FileMetrics& file, double riskScore) const {
    if (riskScore == 0.0) {
        return {"P4", 0.0, "Low", 1.0, 1.0};
    }

    double impactMultiplier = 1.0;
    if (file.complexity.complexFunctionCount > 0) {
        impactMultiplier += std::min(0.3, static_cast<double>(file.complexity.complexFunctionCount) * 0.1);
    }
    if (file.complexity.totalFunctions > 5) {
        impactMultiplier += 0.2;
    }

    double effortFactor = 1.0;
    if (file.totalLines > 300) {
        effortFactor += std::min(0.8, (static_cast<double>(file.totalLines) - 300.0) / 1000.0);
    }
    if (file.complexity.complexFunctionCount > 1) {
        effortFactor += std::min(0.7, (static_cast<double>(file.complexity.complexFunctionCount) - 1.0) * 0.2);
    }

    double rawPriority = round1((riskScore * impactMultiplier) / effortFactor);
    double score = std::min(100.0, std::max(0.0, rawPriority));

    std::string priority = "P4";
    std::string label = "Low";

    if (riskScore >= 75.0 || score >= 70.0) {
        priority = "P1";
        label = "Urgent";
    } else if (riskScore >= 50.0 || score >= 45.0) {
        priority = "P2";
        label = "High";
    } else if (riskScore >= 25.0 || score >= 25.0) {
        priority = "P3";
        label = "Medium";
    }

    return {priority, score, label, round2(impactMultiplier), round2(effortFactor)};
}

void RiskScorer::scoreRepository(ScanResult& scanResult, const RiskWeights* customWeights) const {
    double sumRisk = 0.0;
    double weightedLocSum = 0.0;
    size_t totalLines = 0;

    std::map<std::string, size_t> distribution = {
        {"LOW", 0},
        {"MODERATE", 0},
        {"HIGH", 0},
        {"CRITICAL", 0}
    };

    for (auto& file : scanResult.files) {
        scoreFile(file, customWeights);
        distribution[file.severity]++;
        sumRisk += file.riskScore;
        size_t lines = file.codeLines > 0 ? file.codeLines : file.totalLines;
        weightedLocSum += file.riskScore * static_cast<double>(lines);
        totalLines += lines;
    }

    size_t fileCount = scanResult.files.size();
    double avgRisk = fileCount > 0 ? round1(sumRisk / static_cast<double>(fileCount)) : 0.0;
    double weightedAvgRisk = totalLines > 0 ? round1(weightedLocSum / static_cast<double>(totalLines)) : avgRisk;

    scanResult.technicalDebt.repositoryRiskScore = weightedAvgRisk;
    scanResult.technicalDebt.unweightedAverageRisk = avgRisk;
    scanResult.technicalDebt.overallSeverity = getSeverityLabel(weightedAvgRisk);
    scanResult.technicalDebt.riskDistribution = distribution;

    if (fileCount > 0) {
        scanResult.technicalDebt.riskDistributionPercentages["low"] =
            round1((static_cast<double>(distribution["LOW"]) / static_cast<double>(fileCount)) * 100.0);
        scanResult.technicalDebt.riskDistributionPercentages["moderate"] =
            round1((static_cast<double>(distribution["MODERATE"]) / static_cast<double>(fileCount)) * 100.0);
        scanResult.technicalDebt.riskDistributionPercentages["high"] =
            round1((static_cast<double>(distribution["HIGH"]) / static_cast<double>(fileCount)) * 100.0);
        scanResult.technicalDebt.riskDistributionPercentages["critical"] =
            round1((static_cast<double>(distribution["CRITICAL"]) / static_cast<double>(fileCount)) * 100.0);
    }

    if (!scanResult.files.empty()) {
        scanResult.technicalDebt.activeWeights = scanResult.files.front().riskBreakdown.weightsApplied;
    }

    scanResult.technicalDebt.recommendations = generateRecommendations(scanResult.files, distribution);
}

std::vector<ActionableRecommendation> RiskScorer::generateRecommendations(
    const std::vector<FileMetrics>& files,
    const std::map<std::string, size_t>& distribution
) const {
    std::vector<ActionableRecommendation> recs;

    auto itCrit = distribution.find("CRITICAL");
    if (itCrit != distribution.end() && itCrit->second > 0) {
        recs.push_back({
            "REC_CRITICAL_FILES",
            "CRITICAL",
            "Address " + std::to_string(itCrit->second) + " Critical-Risk Files Immediately",
            std::to_string(itCrit->second) + " file(s) exhibit dangerous combinations of extreme complexity, duplication, or monolithic size. Prioritize these in upcoming refactoring sprints."
        });
    }

    size_t highDupCount = 0;
    size_t complexFuncCount = 0;
    size_t largeFileCount = 0;

    for (const auto& f : files) {
        if (f.duplicatePercentage >= 30.0) highDupCount++;
        complexFuncCount += f.complexity.complexFunctionCount;
        if (f.totalLines > 500) largeFileCount++;
    }

    if (highDupCount > 0) {
        recs.push_back({
            "REC_CONSOLIDATE_CLONES",
            "HIGH",
            "Extract Shared Utilities for " + std::to_string(highDupCount) + " Highly Duplicated Files",
            "Over 30% of code in " + std::to_string(highDupCount) + " file(s) consists of cloned blocks. Consolidating repeated algorithms into shared modules will reduce maintenance overhead."
        });
    }

    if (complexFuncCount > 0) {
        recs.push_back({
            "REC_DECOMPOSE_FUNCTIONS",
            "MEDIUM",
            "Decompose " + std::to_string(complexFuncCount) + " Functions with Cyclomatic Complexity > 10",
            "Functions exceeding McCabe complexity 10 require extensive branch testing and are prone to regression. Break them down into smaller, single-responsibility helpers."
        });
    }

    if (largeFileCount > 0) {
        recs.push_back({
            "REC_MODULARIZE_GOD_OBJECTS",
            "MEDIUM",
            "Modularize " + std::to_string(largeFileCount) + " Monolithic Files Exceeding 500 LOC",
            "Large files violate the Single Responsibility Principle and increase merge conflicts. Split them into domain-driven sub-components."
        });
    }

    if (recs.empty()) {
        recs.push_back({
            "REC_MAINTAIN_STANDARD",
            "LOW",
            "Maintain Current High Codebase Health Standards",
            "No severe technical debt hotspots detected. Continue adhering to modular design and automated regression scanning."
        });
    }

    return recs;
}

} // namespace codeinsight
