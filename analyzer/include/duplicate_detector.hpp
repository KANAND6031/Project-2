#ifndef CODEINSIGHT_DUPLICATE_DETECTOR_HPP
#define CODEINSIGHT_DUPLICATE_DETECTOR_HPP

#include <string>
#include <vector>
#include <map>
#include <set>
#include <cstdint>

namespace codeinsight {

struct SourceFragment {
    std::string filePath;
    size_t startLine = 0;
    size_t endLine = 0;
    size_t lineCount = 0;
};

struct DuplicateGroup {
    std::string id;
    size_t lineCount = 0;
    std::string sampleSnippet;
    std::vector<SourceFragment> fragments;
};

struct DuplicateReport {
    size_t totalDuplicateBlocks = 0;
    size_t totalDuplicateLines = 0;
    double overallDuplicationPercentage = 0.0;
    std::vector<DuplicateGroup> groups;
    std::map<std::string, size_t> duplicateLinesByFile;
    std::map<std::string, double> duplicatePercentageByFile;
};

struct DuplicateConfig {
    size_t minBlockLines = 5;          // Minimum consecutive lines to count as a duplicate block
    size_t minTokenChars = 30;         // Minimum characters across the block to avoid trivial matches
    bool ignoreComments = true;
    bool normalizeWhitespace = true;
};

class DuplicateDetector {
public:
    explicit DuplicateDetector(const DuplicateConfig& config = DuplicateConfig());

    // Analyzes a list of files with their source contents and computes duplicate groups
    DuplicateReport analyze(const std::vector<std::pair<std::string, std::string>>& filesWithContent,
                            const std::map<std::string, size_t>& fileTotalLines);

    // Normalizes a line of source code (collapses whitespace, strips whitespace)
    static std::string normalizeLine(const std::string& line);

private:
    DuplicateConfig config_;

    struct NormalizedLine {
        std::string text;
        size_t originalLineNumber = 0;
    };

    std::vector<NormalizedLine> preprocessFile(const std::string& content) const;
    static uint64_t hashBlock(const std::vector<NormalizedLine>& lines, size_t start, size_t count);
};

} // namespace codeinsight

#endif // CODEINSIGHT_DUPLICATE_DETECTOR_HPP

