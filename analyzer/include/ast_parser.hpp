#ifndef CODEINSIGHT_AST_PARSER_HPP
#define CODEINSIGHT_AST_PARSER_HPP

#include <string>
#include <vector>
#include <cstdint>
#include <tree_sitter/api.h>

namespace codeinsight {

struct FunctionMetrics {
    std::string name;
    size_t startLine = 0;
    size_t endLine = 0;
    size_t startColumn = 0;
    size_t endColumn = 0;
    size_t lineCount = 0;
    size_t parameterCount = 0;
    size_t cyclomaticComplexity = 1; // Baseline M = 1
    size_t maxNestingDepth = 0;
    bool isHighComplexity = false;   // True if complexity > 10
};

struct FileComplexitySummary {
    size_t totalFunctions = 0;
    double averageComplexity = 0.0;
    size_t maxComplexity = 0;
    size_t maxNestingDepth = 0;
    size_t complexFunctionCount = 0;
    std::vector<FunctionMetrics> functions;
};

class AstParser {
public:
    AstParser();
    ~AstParser();

    // Disable copy to manage TSParser handles safely
    AstParser(const AstParser&) = delete;
    AstParser& operator=(const AstParser&) = delete;

    // Parses source code string with Tree-sitter and extracts function & complexity metrics
    FileComplexitySummary analyzeSource(const std::string& sourceCode, const std::string& language);

private:
    TSParser* cParser_ = nullptr;
    TSParser* jsParser_ = nullptr;

    void initParsers();
    void traverseNode(TSNode node, const std::string& sourceCode, const std::string& language, FileComplexitySummary& summary);
    FunctionMetrics processFunctionNode(TSNode node, const std::string& sourceCode, const std::string& language);
    void computeComplexityAndNesting(TSNode node, const std::string& sourceCode, size_t currentDepth, size_t& complexity, size_t& maxDepth);
    std::string extractNodeText(TSNode node, const std::string& sourceCode) const;
    std::string extractFunctionName(TSNode funcNode, const std::string& sourceCode, const std::string& language) const;
    size_t countParameters(TSNode funcNode) const;
    bool isDecisionPoint(TSNode node, const std::string& sourceCode) const;
    bool isNestingControlStructure(TSNode node) const;
};

} // namespace codeinsight

#endif // CODEINSIGHT_AST_PARSER_HPP

