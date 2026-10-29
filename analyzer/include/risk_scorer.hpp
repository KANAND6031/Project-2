#ifndef CODEINSIGHT_RISK_SCORER_HPP
#define CODEINSIGHT_RISK_SCORER_HPP

#include <string>
#include <vector>
#include <map>
#include <cstdint>

namespace codeinsight {

// Default weights: R = 0.45*C + 0.35*D + 0.20*S
struct RiskWeights {
    double complexity = 0.45;
    double duplication = 0.35;
    double structural = 0.20;
};

// Structural sub-weights: S = 0.40*L + 0.35*N + 0.25*P
struct StructuralWeights {
    double length = 0.40;
    double nesting = 0.35;
    double parameters = 0.25;
};

// Structural component breakdown details
struct StructuralDetails {
    double lengthScore = 0.0;
    double nestingScore = 0.0;
    double parameterScore = 0.0;
    size_t maxFunctionLength = 0;
    size_t maxParameterCount = 0;
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
    std::string status = "EVALUATED";
};

// Sub-scores for each technical debt dimension
struct RiskSubScores {
    double complexity = 0.0;
    double duplication = 0.0;
    double structural = 0.0;
};

// Complete explainable risk breakdown for a single source file
struct FileRiskBreakdown {
    RiskSubScores subScores;
    StructuralDetails structuralDetails;
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
    std::string formula = "R = 0.45*C + 0.35*D + 0.20*S";
    std::map<std::string, size_t> riskDistribution; // LOW, MODERATE, HIGH, CRITICAL counts
    std::map<std::string, double> riskDistributionPercentages;
    std::map<std::string, double> activeWeights;
    std::vector<ActionableRecommendation> recommendations;
};

// Forward declaration of FileMetrics and ScanResult
struct FileMetrics;
struct ScanResult;

class RiskScorer {
public:
    explicit RiskScorer(
        const RiskWeights& weights = RiskWeights(),
        const StructuralWeights& sWeights = StructuralWeights()
    );

    // Threshold component calculations
    static double calculateComplexityScore(size_t maxComplexity, size_t totalFunctions);
    static double calculateDuplicationScore(double dupPercentage);
    static double calculateLengthScore(size_t totalLines, size_t maxFuncLen);
    static double calculateNestingScore(size_t maxNesting, size_t totalFunctions);
    static double calculateParameterScore(size_t maxParams, size_t totalFunctions);
    static std::string getSeverityLabel(double score);

    // Scoring methods
    void scoreFile(FileMetrics& file, const RiskWeights* customWeights = nullptr) const;
    void scoreRepository(ScanResult& scanResult, const RiskWeights* customWeights = nullptr) const;

private:
    RiskWeights defaultWeights_;
    StructuralWeights structuralWeights_;

    std::vector<std::string> generateRiskFactors(
        const FileMetrics& file,
        double C,
        double D,
        const StructuralDetails& sDetails,
        double totalScore
    ) const;

    RemediationPriority calculateRemediationPriority(const FileMetrics& file, double riskScore) const;

    std::vector<ActionableRecommendation> generateRecommendations(
        const std::vector<FileMetrics>& files,
        const std::map<std::string, size_t>& distribution
    ) const;
};

} // namespace codeinsight

#endif // CODEINSIGHT_RISK_SCORER_HPP
