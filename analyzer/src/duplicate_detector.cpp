#include "../include/duplicate_detector.hpp"

#include <iostream>
#include <sstream>
#include <algorithm>
#include <unordered_map>
#include <iomanip>

namespace codeinsight {

namespace {

uint64_t fnv1a(const std::string& str) {
    uint64_t hash = 14695981039346656037ULL;
    for (char c : str) {
        hash ^= static_cast<uint8_t>(c);
        hash *= 1099511628211ULL;
    }
    return hash;
}

std::string trim(const std::string& str) {
    size_t first = str.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) return "";
    size_t last = str.find_last_not_of(" \t\r\n");
    return str.substr(first, (last - first + 1));
}

} // namespace

DuplicateDetector::DuplicateDetector(const DuplicateConfig& config)
    : config_(config) {}

std::string DuplicateDetector::normalizeLine(const std::string& line) {
    std::string trimmed = trim(line);
    if (trimmed.empty()) return "";

    std::string result;
    result.reserve(trimmed.length());
    bool inSpace = false;

    for (char c : trimmed) {
        if (c == ' ' || c == '\t') {
            if (!inSpace) {
                result.push_back(' ');
                inSpace = true;
            }
        } else {
            result.push_back(c);
            inSpace = false;
        }
    }
    return result;
}

std::vector<DuplicateDetector::NormalizedLine> DuplicateDetector::preprocessFile(const std::string& content) const {
    std::vector<NormalizedLine> lines;
    std::istringstream stream(content);
    std::string rawLine;
    size_t lineNum = 0;
    bool inBlockComment = false;

    while (std::getline(stream, rawLine)) {
        lineNum++;
        if (!rawLine.empty() && rawLine.back() == '\r') {
            rawLine.pop_back();
        }

        std::string stripped;
        if (config_.ignoreComments) {
            for (size_t i = 0; i < rawLine.length(); ++i) {
                if (inBlockComment) {
                    if (rawLine[i] == '*' && i + 1 < rawLine.length() && rawLine[i + 1] == '/') {
                        inBlockComment = false;
                        i++;
                    }
                    continue;
                }
                if (rawLine[i] == '/' && i + 1 < rawLine.length() && rawLine[i + 1] == '*') {
                    inBlockComment = true;
                    i++;
                    continue;
                }
                if (rawLine[i] == '/' && i + 1 < rawLine.length() && rawLine[i + 1] == '/') {
                    break;
                }
                stripped.push_back(rawLine[i]);
            }
        } else {
            stripped = rawLine;
        }

        std::string norm = normalizeLine(stripped);
        if (!norm.empty()) {
            NormalizedLine nl;
            nl.text = norm;
            nl.originalLineNumber = lineNum;
            lines.push_back(nl);
        }
    }

    return lines;
}

uint64_t DuplicateDetector::hashBlock(const std::vector<NormalizedLine>& lines, size_t start, size_t count) {
    std::string combined;
    for (size_t i = 0; i < count; ++i) {
        combined += lines[start + i].text;
        combined.push_back('\n');
    }
    return fnv1a(combined);
}

DuplicateReport DuplicateDetector::analyze(
    const std::vector<std::pair<std::string, std::string>>& filesWithContent,
    const std::map<std::string, size_t>& fileTotalLines) {

    DuplicateReport report;
    if (filesWithContent.empty() || config_.minBlockLines == 0) {
        return report;
    }

    // Preprocess all files into normalized lines
    std::vector<std::vector<NormalizedLine>> allFilesNormalized;
    allFilesNormalized.reserve(filesWithContent.size());

    for (const auto& fc : filesWithContent) {
        allFilesNormalized.push_back(preprocessFile(fc.second));
    }

    struct BlockLocation {
        size_t fileIndex;
        size_t lineIndex;
    };

    // Sliding window block index: hash -> list of locations
    std::unordered_map<uint64_t, std::vector<BlockLocation>> blockIndex;

    for (size_t f = 0; f < allFilesNormalized.size(); ++f) {
        const auto& normLines = allFilesNormalized[f];
        if (normLines.size() < config_.minBlockLines) continue;

        for (size_t i = 0; i <= normLines.size() - config_.minBlockLines; ++i) {
            // Check character threshold to skip trivial repeating lines
            size_t charCount = 0;
            for (size_t k = 0; k < config_.minBlockLines; ++k) {
                charCount += normLines[i + k].text.length();
            }
            if (charCount < config_.minTokenChars) continue;

            uint64_t h = hashBlock(normLines, i, config_.minBlockLines);
            blockIndex[h].push_back({f, i});
        }
    }

    struct ClonePair {
        size_t file1;
        size_t start1;
        size_t file2;
        size_t start2;
        size_t length;
    };

    std::vector<ClonePair> rawPairs;

    // Detect matching blocks and extend them forward to find maximal clones
    for (const auto& kv : blockIndex) {
        const auto& locs = kv.second;
        if (locs.size() < 2) continue;

        for (size_t a = 0; a < locs.size(); ++a) {
            for (size_t b = a + 1; b < locs.size(); ++b) {
                size_t f1 = locs[a].fileIndex;
                size_t s1 = locs[a].lineIndex;
                size_t f2 = locs[b].fileIndex;
                size_t s2 = locs[b].lineIndex;

                // Don't compare same starting position in same file
                if (f1 == f2 && s1 == s2) continue;

                // Extend forward
                size_t ext = config_.minBlockLines;
                const auto& lines1 = allFilesNormalized[f1];
                const auto& lines2 = allFilesNormalized[f2];

                while (s1 + ext < lines1.size() &&
                       s2 + ext < lines2.size() &&
                       lines1[s1 + ext].text == lines2[s2 + ext].text) {
                    ext++;
                }

                rawPairs.push_back({f1, s1, f2, s2, ext});
            }
        }
    }

    // Filter out sub-blocks covered by longer clones
    std::vector<ClonePair> maximalPairs;
    for (size_t i = 0; i < rawPairs.size(); ++i) {
        bool isSubsumed = false;
        for (size_t j = 0; j < rawPairs.size(); ++j) {
            if (i == j) continue;
            // If pair j covers pair i with greater length
            if (rawPairs[j].file1 == rawPairs[i].file1 &&
                rawPairs[j].file2 == rawPairs[i].file2 &&
                rawPairs[j].start1 <= rawPairs[i].start1 &&
                rawPairs[j].start2 <= rawPairs[i].start2 &&
                (rawPairs[j].start1 + rawPairs[j].length) >= (rawPairs[i].start1 + rawPairs[i].length) &&
                (rawPairs[j].start2 + rawPairs[j].length) >= (rawPairs[i].start2 + rawPairs[i].length) &&
                rawPairs[j].length > rawPairs[i].length) {
                isSubsumed = true;
                break;
            }
        }
        if (!isSubsumed) {
            maximalPairs.push_back(rawPairs[i]);
        }
    }

    // Build clusters of duplicate fragments into DuplicateGroups
    std::map<std::string, std::set<size_t>> fileToDuplicatedOriginalLines;
    size_t groupCounter = 0;

    // Use a visited map to prevent duplicate identical clusters
    std::set<std::string> seenClusterKeys;

    for (const auto& cp : maximalPairs) {
        const std::string& path1 = filesWithContent[cp.file1].first;
        const std::string& path2 = filesWithContent[cp.file2].first;

        size_t origStart1 = allFilesNormalized[cp.file1][cp.start1].originalLineNumber;
        size_t origEnd1 = allFilesNormalized[cp.file1][cp.start1 + cp.length - 1].originalLineNumber;
        size_t origStart2 = allFilesNormalized[cp.file2][cp.start2].originalLineNumber;
        size_t origEnd2 = allFilesNormalized[cp.file2][cp.start2 + cp.length - 1].originalLineNumber;

        // Record duplicated lines for per-file metrics
        for (size_t l = origStart1; l <= origEnd1; ++l) {
            fileToDuplicatedOriginalLines[path1].insert(l);
        }
        for (size_t l = origStart2; l <= origEnd2; ++l) {
            fileToDuplicatedOriginalLines[path2].insert(l);
        }

        std::string clusterKey = path1 + ":" + std::to_string(origStart1) + "_" +
                                 path2 + ":" + std::to_string(origStart2);
        if (seenClusterKeys.find(clusterKey) != seenClusterKeys.end()) continue;
        seenClusterKeys.insert(clusterKey);

        DuplicateGroup grp;
        std::ostringstream ssId;
        ssId << "DUP-" << std::setfill('0') << std::setw(3) << (++groupCounter);
        grp.id = ssId.str();
        grp.lineCount = cp.length;

        // Sample snippet from first occurrence
        std::string snippet;
        size_t snippetLines = std::min(cp.length, static_cast<size_t>(3));
        for (size_t k = 0; k < snippetLines; ++k) {
            snippet += allFilesNormalized[cp.file1][cp.start1 + k].text;
            if (k + 1 < snippetLines) snippet += "\n";
        }
        grp.sampleSnippet = snippet;

        SourceFragment frag1;
        frag1.filePath = path1;
        frag1.startLine = origStart1;
        frag1.endLine = origEnd1;
        frag1.lineCount = (origEnd1 >= origStart1) ? (origEnd1 - origStart1 + 1) : 1;
        grp.fragments.push_back(frag1);

        SourceFragment frag2;
        frag2.filePath = path2;
        frag2.startLine = origStart2;
        frag2.endLine = origEnd2;
        frag2.lineCount = (origEnd2 >= origStart2) ? (origEnd2 - origStart2 + 1) : 1;
        grp.fragments.push_back(frag2);

        report.groups.push_back(grp);
    }

    report.totalDuplicateBlocks = report.groups.size();

    // Calculate per-file duplicate lines and duplicate percentage
    size_t totalDupLinesAllFiles = 0;
    size_t totalCodeLinesAllFiles = 0;

    for (const auto& fc : filesWithContent) {
        const std::string& path = fc.first;
        size_t dupCount = fileToDuplicatedOriginalLines[path].size();
        report.duplicateLinesByFile[path] = dupCount;

        auto it = fileTotalLines.find(path);
        size_t totalLines = (it != fileTotalLines.end()) ? it->second : 0;
        totalCodeLinesAllFiles += totalLines;
        totalDupLinesAllFiles += dupCount;

        double pct = (totalLines > 0) ? (static_cast<double>(dupCount) * 100.0 / static_cast<double>(totalLines)) : 0.0;
        report.duplicatePercentageByFile[path] = pct;
    }

    report.totalDuplicateLines = totalDupLinesAllFiles;
    if (totalCodeLinesAllFiles > 0) {
        report.overallDuplicationPercentage = (static_cast<double>(totalDupLinesAllFiles) * 100.0 /
                                              static_cast<double>(totalCodeLinesAllFiles));
    }

    return report;
}

} // namespace codeinsight

