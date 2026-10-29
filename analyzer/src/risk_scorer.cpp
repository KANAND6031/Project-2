#include "../include/risk_scorer.hpp"
#include "../include/scanner.hpp"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>

namespace codeinsight {

namespace {

double round1(double val) {
    return std::round(val * 10.0) / 10.0;
}

double round2(double val) {
    return std::round(val * 100.0) / 100.0;
}

} // namespace

RiskScorer::RiskScorer(const RiskWeights& weights, const StructuralWeights& sWeights)
    : defaultWeights_(weights), structuralWeights_(sWeights) {}

double RiskScorer::calculateComplexityScore(size_t maxComplexity, size_t totalFunctions) {
    if (totalFunctions == 0 || maxComplexity == 0) return 0.0;
    if (maxComplexity <= 5) return 10.0;
    if (maxComplexity <= 10) return 35.0;
    if (maxComplexity <= 15) return 65.0;
    return 90.0;
}

double RiskScorer::calculateDuplicationScore(double dupPercentage) {
    if (dupPercentage <= 0.0) return 0.0;
    if (dupPercentage <= 5.0) return 20.0;
    if (dupPercentage <= 10.0) return 40.0;
    if (dupPercentage <= 20.0) return 70.0;
    return 90.0;
}

double RiskScorer::calculateLengthScore(size_t totalLines, size_t maxFuncLen) {
    if (totalLines == 0) return 0.0;
    if (totalLines <= 100 && maxFuncLen <= 30) return 10.0;
    if (totalLines <= 300 && maxFuncLen <= 60) return 35.0;
    if (totalLines <= 700 && maxFuncLen <= 120) return 65.0;
    return 90.0;
}

double RiskScorer::calculateNestingScore(size_t maxNesting, size_t totalFunctions) {
    if (totalFunctions == 0) return 0.0;
    if (maxNesting <= 1) return 10.0;
    if (maxNesting == 2) return 35.0;
    if (maxNesting == 3) return 65.0;
    return 90.0;
}

double RiskScorer::calculateParameterScore(size_t maxParams, size_t totalFunctions) {
    if (totalFunctions == 0) return 0.0;
    if (maxParams <= 2) return 10.0;
    if (maxParams <= 4) return 35.0;
    if (maxParams <= 6) return 65.0;
    return 90.0;
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

    size_t maxFuncLen = 0;
    size_t maxParams = 0;
    for (const auto& fn : file.complexity.functions) {
        if (fn.lineCount > maxFuncLen) maxFuncLen = fn.lineCount;
        if (fn.parameterCount > maxParams) maxParams = fn.parameterCount;
    }

    double C = calculateComplexityScore(file.complexity.maxComplexity, file.complexity.totalFunctions);
    double D = calculateDuplicationScore(file.duplicatePercentage);

    double L = calculateLengthScore(file.totalLines, maxFuncLen);
    double N = calculateNestingScore(file.complexity.maxNestingDepth, file.complexity.totalFunctions);
    double P = calculateParameterScore(maxParams, file.complexity.totalFunctions);

    double S = round2((structuralWeights_.length * L) +
                      (structuralWeights_.nesting * N) +
                      (structuralWeights_.parameters * P));

    double weightedC = round2(weights.complexity * C);
    double weightedD = round2(weights.duplication * D);
    double weightedS = round2(weights.structural * S);

    double totalScore = round1(weightedC + weightedD + weightedS);
    totalScore = std::min(100.0, std::max(0.0, totalScore));

    file.riskScore = totalScore;
    file.severity = getSeverityLabel(totalScore);

    FileRiskBreakdown breakdown;
    breakdown.subScores.complexity = C;
    breakdown.subScores.duplication = D;
    breakdown.subScores.structural = S;

    breakdown.structuralDetails.lengthScore = L;
    breakdown.structuralDetails.nestingScore = N;
    breakdown.structuralDetails.parameterScore = P;
    breakdown.structuralDetails.maxFunctionLength = maxFuncLen;
    breakdown.structuralDetails.maxParameterCount = maxParams;

    breakdown.weightsApplied["complexity"] = weights.complexity;
    breakdown.weightsApplied["duplication"] = weights.duplication;
    breakdown.weightsApplied["structural"] = weights.structural;

    ContributingMetric cmComp;
    cmComp.dimension = "complexity";
    cmComp.hasRawScore = true;
    cmComp.rawScore = C;
    cmComp.activeWeight = weights.complexity;
    cmComp.weightedPoints = weightedC;
    cmComp.contributionPercentage = totalScore > 0 ? round1((weightedC / totalScore) * 100.0) : 0.0;
    cmComp.status = "EVALUATED";
    breakdown.contributingMetrics.push_back(cmComp);

    ContributingMetric cmDup;
    cmDup.dimension = "duplication";
    cmDup.hasRawScore = true;
    cmDup.rawScore = D;
    cmDup.activeWeight = weights.duplication;
    cmDup.weightedPoints = weightedD;
    cmDup.contributionPercentage = totalScore > 0 ? round1((weightedD / totalScore) * 100.0) : 0.0;
    cmDup.status = "EVALUATED";
    breakdown.contributingMetrics.push_back(cmDup);

    ContributingMetric cmStruct;
    cmStruct.dimension = "structural";
    cmStruct.hasRawScore = true;
    cmStruct.rawScore = S;
    cmStruct.activeWeight = weights.structural;
    cmStruct.weightedPoints = weightedS;
    cmStruct.contributionPercentage = totalScore > 0 ? round1((weightedS / totalScore) * 100.0) : 0.0;
    cmStruct.status = "EVALUATED";
    breakdown.contributingMetrics.push_back(cmStruct);

    std::sort(breakdown.contributingMetrics.begin(), breakdown.contributingMetrics.end(),
              [](const ContributingMetric& a, const ContributingMetric& b) {
                  return a.weightedPoints > b.weightedPoints;
              });

    breakdown.riskFactors = generateRiskFactors(file, C, D, breakdown.structuralDetails, totalScore);
    file.riskBreakdown = breakdown;
    file.remediationPriority = calculateRemediationPriority(file, totalScore);
}

std::vector<std::string> RiskScorer::generateRiskFactors(
    const FileMetrics& file,
    double C,
    double D,
    const StructuralDetails& sDetails,
    double totalScore
) const {
    std::vector<std::string> factors;

    if (C >= 65.0) {
        std::string worstName = "a function";
        for (const auto& fn : file.complexity.functions) {
            if (fn.cyclomaticComplexity == file.complexity.maxComplexity) {
                worstName = "'" + fn.name + "'";
                break;
            }
        }
        factors.push_back("High cyclomatic complexity: " + worstName +
                          " reaches complexity of " + std::to_string(file.complexity.maxComplexity) +
                          " (complexity score: " + std::to_string(static_cast<int>(C)) + "/100)");
    } else if (C == 35.0) {
        factors.push_back("Moderate cyclomatic complexity: max complexity is " +
                          std::to_string(file.complexity.maxComplexity) + " (score: 35/100)");
    }

    if (D >= 70.0) {
        std::ostringstream ss;
        ss << std::fixed << std::setprecision(1) << file.duplicatePercentage;
        factors.push_back("Significant code duplication: " + ss.str() +
                          "% of lines duplicated (duplication score: " + std::to_string(static_cast<int>(D)) + "/100)");
    } else if (D >= 40.0) {
        std::ostringstream ss;
        ss << std::fixed << std::setprecision(1) << file.duplicatePercentage;
        factors.push_back("Moderate code duplication: " + ss.str() + "% of lines duplicated (score: " +
                          std::to_string(static_cast<int>(D)) + "/100)");
    }

    if (sDetails.nestingScore >= 65.0) {
        factors.push_back("Deep nesting depth: control flow reaches " +
                          std::to_string(file.complexity.maxNestingDepth) + " levels (threshold: >=3)");
    }

    if (sDetails.lengthScore >= 65.0) {
        factors.push_back("Large file or functions: spans " + std::to_string(file.totalLines) +
                          " lines (max function length: " + std::to_string(sDetails.maxFunctionLength) + " lines)");
    }

    if (sDetails.parameterScore >= 65.0) {
        factors.push_back("High parameter count: functions take up to " +
                          std::to_string(sDetails.maxParameterCount) + " parameters (threshold: >4)");
    }

    if (factors.empty()) {
        if (totalScore < 25.0) {
            factors.push_back("Clean code structure: all complexity, duplication, and structural metrics within low-risk thresholds");
        } else {
            factors.push_back("Cumulative moderate structural debt distributed across multiple metrics");
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
    scanResult.technicalDebt.formula = "R = 0.45*C + 0.35*D + 0.20*S";
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
            std::to_string(itCrit->second) + " file(s) exhibit high complexity, duplication, or monolithic structure. Prioritize these in upcoming refactoring sprints."
        });
    }

    size_t highDupCount = 0;
    size_t complexFuncCount = 0;
    size_t largeFileCount = 0;

    for (const auto& f : files) {
        if (f.duplicatePercentage >= 20.0) highDupCount++;
        complexFuncCount += f.complexity.complexFunctionCount;
        if (f.totalLines > 300) largeFileCount++;
    }

    if (highDupCount > 0) {
        recs.push_back({
            "REC_CONSOLIDATE_CLONES",
            "HIGH",
            "Extract Shared Logic for " + std::to_string(highDupCount) + " Highly Duplicated Files",
            "Over 20% of code in " + std::to_string(highDupCount) + " file(s) consists of cloned blocks. Consolidating repeated patterns into shared modules will reduce maintenance overhead."
        });
    }

    if (complexFuncCount > 0) {
        recs.push_back({
            "REC_DECOMPOSE_FUNCTIONS",
            "MEDIUM",
            "Decompose " + std::to_string(complexFuncCount) + " Functions with Cyclomatic Complexity > 10",
            "Functions exceeding McCabe complexity 10 require extensive branch testing and are prone to regression. Break them down into smaller helpers."
        });
    }

    if (largeFileCount > 0) {
        recs.push_back({
            "REC_MODULARIZE_GOD_OBJECTS",
            "MEDIUM",
            "Modularize " + std::to_string(largeFileCount) + " Files Exceeding 300 LOC",
            "Large files violate the Single Responsibility Principle. Consider splitting them into focused sub-modules."
        });
    }

    if (recs.empty()) {
        recs.push_back({
            "REC_MAINTAIN_STANDARD",
            "LOW",
            "Maintain Current High Codebase Health Standards",
            "No severe technical debt hotspots detected. Continue adhering to modular design."
        });
    }

    return recs;
}

} // namespace codeinsight
