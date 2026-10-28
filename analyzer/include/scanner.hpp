#ifndef CODEINSIGHT_SCANNER_HPP
#define CODEINSIGHT_SCANNER_HPP

#include <string>
#include <vector>
#include <map>
#include <set>
#include <cstdint>
#include "ast_parser.hpp"

namespace codeinsight {

// Reason for skipping a file during repository discovery
enum class SkipReason {
    EXCLUDED_DIRECTORY,
    UNSUPPORTED_EXTENSION,
    BINARY_FILE,
    MINIFIED_OR_GENERATED,
    EXCEEDS_SIZE_LIMIT,
    UNREADABLE_FILE,
    GITIGNORED
};

std::string skipReasonToString(SkipReason reason);

// Detailed metrics for an individual analyzed source file
struct FileMetrics {
    std::string relativePath;
    std::string absolutePath;
    std::string fileName;
    std::string extension;
    std::string language;
    size_t totalLines = 0;
    size_t codeLines = 0;
    size_t commentLines = 0;
    size_t blankLines = 0;
    size_t mixedLines = 0;        // Lines containing both code and comments
    size_t maxLineLength = 0;
    bool hasLongLines = false;     // True if any line exceeds minification threshold
    uint64_t fileSizeBytes = 0;

    // Phase 3 AST metrics
    FileComplexitySummary complexity;
};

// Information about a file that was skipped
struct SkippedFileInfo {
    std::string relativePath;
    std::string absolutePath;
    std::string reason;
    std::string details;
};

// Aggregate summary of repository scan
struct ScanSummary {
    size_t totalFilesScanned = 0;
    size_t totalLines = 0;
    size_t totalCodeLines = 0;
    size_t totalCommentLines = 0;
    size_t totalBlankLines = 0;
    size_t totalMixedLines = 0;
    uint64_t totalSizeBytes = 0;
    size_t skippedFilesCount = 0;
    size_t errorCount = 0;
    std::map<std::string, size_t> filesByLanguage;
    std::map<std::string, size_t> linesByLanguage;

    // Phase 3 AST complexity aggregate metrics
    size_t totalFunctions = 0;
    double averageComplexity = 0.0;
    size_t maxComplexity = 0;
    size_t highComplexityFunctionCount = 0;
};

// Full scan result returned by the analyzer
struct ScanResult {
    std::string engineVersion;
    std::string repoPath;
    std::string scanTimestamp;
    ScanSummary summary;
    std::vector<FileMetrics> files;
    std::vector<SkippedFileInfo> skippedFiles;
    std::vector<std::string> errors;
};

// Scanner configuration options
struct ScanConfig {
    uint64_t maxFileSizeBytes = 5 * 1024 * 1024; // 5 MB max file size
    size_t maxLineLengthThreshold = 1000;         // Lines longer than 1000 chars flag minification
    bool respectGitignore = true;
    std::vector<std::string> additionalExcludedDirs;
};

// State-machine token counter for lexical line analysis
struct LineAnalysisResult {
    size_t totalLines = 0;
    size_t codeLines = 0;
    size_t commentLines = 0;
    size_t blankLines = 0;
    size_t mixedLines = 0;
    size_t maxLineLength = 0;
    bool hasLongLines = false;
};

class DirectoryScanner {
public:
    explicit DirectoryScanner(const ScanConfig& config = ScanConfig());

    // Scans root directory and returns complete ScanResult
    ScanResult scan(const std::string& rootDirectory);

    // Serializes ScanResult to formatted JSON string
    static std::string serializeToJson(const ScanResult& result);

    // Utility methods (exposed for unit testing)
    static bool isBinaryFile(const std::string& filePath);
    static bool isMinifiedOrGenerated(const std::string& fileName, size_t maxLineLen);
    static LineAnalysisResult analyzeFileLines(const std::string& fullPath, const std::string& language, size_t maxLineThreshold);

private:
    ScanConfig config_;
    AstParser astParser_;
    std::vector<std::string> gitignorePatterns_;
    std::set<std::string> visitedCanonicalPaths_; // Prevents symlink loops

    void loadGitignore(const std::string& rootDirectory);
    bool isExcludedDirectory(const std::string& dirName) const;
    bool isGitignored(const std::string& relativePath) const;
    bool isSupportedSourceFile(const std::string& filename, std::string& outLang, std::string& outExt) const;
    void scanRecursive(const std::string& currentPath, const std::string& rootPath, ScanResult& result);
};

} // namespace codeinsight

#endif // CODEINSIGHT_SCANNER_HPP
