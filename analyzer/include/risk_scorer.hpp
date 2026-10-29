#ifndef CODEINSIGHT_RISK_SCORER_HPP
#define CODEINSIGHT_RISK_SCORER_HPP

#include <string>
#include <vector>
#include <map>
#include <cstdint>

namespace codeinsight {

// Default provisional weights for technical debt dimensions
struct RiskWeights {
    double complexity = 0.30;
    double duplication = 0.25;
    double dependency = 0.20;
    double churn = 0.15;
    double structural = 0.10;
};

// Remediation priority assessment
struct RemediationPriority {
    std::string priority = "P4"; // P1, P2, P3, P4
    double score = 0.0;
    std::string label = "Low";
    double impactMultiplier = 1.0;
    double effortFactor = 1.0;
};

// Breakdown of an individual dimension's contribution to file risk
struct ContributingMetric {
    std::string dimension;
    bool hasRawScore = false;
    double rawScore = 0.0;
    double activeWeight = 0.0;
    double weightedPoints = 0.0;
    double contributionPercentage = 0.0;
    std::string status = "EVALUATED"; // "EVALUATED" or "SKIPPED_OR_MISSING"
};

// Sub-scores for each technical debt dimension
struct RiskSubScores {
    double complexity = 0.0;
    double duplication = 0.0;
    double structural = 0.0;
    bool hasDependency = false;
    double dependency = 0.0;
    bool hasChurn = false;
    double churn = 0.0;
};

// Complete explainable risk breakdown for a single source file
struct FileRiskBreakdown {
    RiskSubScores subScores;
    std::map<std::string, double> weightsApplied;
    std::vector<std::string> riskFactors;
    std::vector<ContributingMetric> contributingMetrics;
};

// Actionable recommendation generated from repository-level analysis
struct ActionableRecommendation {
    std::string id;
    std::string severity; // CRITICAL, HIGH, MEDIUM, LOW
    std::string title;
    std::string description;
};

// Repository-level technical debt summary
struct TechnicalDebtSummary {
    double repositoryRiskScore = 0.0;
    double unweightedAverageRisk = 0.0;
    std::string overallSeverity = "LOW";
    std::map<std::string, size_t> riskDistribution; // LOW, MODERATE, HIGH, CRITICAL counts
    std::map<std::string, double> riskDistributionPercentages;
    std::map<std::string, double> activeWeights;
    std::vector<ActionableRecommendation> recommendations;
};

// Forward declaration of FileMetrics
struct FileMetrics;
struct ScanResult;

class RiskScorer {
public:
    explicit RiskScorer(const RiskWeights& weights = RiskWeights());

    // Normalization functions (0-100 scale)
    static double normalizeMaxComplexity(size_t maxComplexity);
    static double normalizeNestingDepth(size_t maxNestingDepth);
    static double normalizeDuplication(double dupPercentage);
    static double normalizeStructuralMetrics(size_t totalLines, size_t maxLineLength);
    static std::string getSeverityLabel(double score);

    // Scoring methods
    void scoreFile(FileMetrics& file, const RiskWeights* customWeights = nullptr) const;
    void scoreRepository(ScanResult& scanResult, const RiskWeights* customWeights = nullptr) const;

private:
    RiskWeights defaultWeights_;

    std::vector<std::string> generateRiskFactors(const FileMetrics& file, double totalScore) const;
    RemediationPriority calculateRemediationPriority(const FileMetrics& file, double riskScore) const;
    std::vector<ActionableRecommendation> generateRecommendations(
        const std::vector<FileMetrics>& files,
        const std::map<std::string, size_t>& distribution
    ) const;
};

} // namespace codeinsight

#endif // CODEINSIGHT_RISK_SCORER_HPP
