#include "../include/scanner.hpp"

#include <iostream>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <ctime>
#include <cctype>
#include <sys/stat.h>

#if defined(_WIN32)
#include <windows.h>
#define stat_func _stat64
#define stat_struct struct __stat64
#else
#include <dirent.h>
#include <unistd.h>
#define stat_func stat
#define stat_struct struct stat
#endif

namespace codeinsight {

namespace {

std::string getIsoTimestamp() {
    std::time_t now = std::time(nullptr);
    char buf[64];
    std::tm* tm_ptr = std::gmtime(&now);
    if (tm_ptr) {
        std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", tm_ptr);
        return std::string(buf);
    }
    return "1970-01-01T00:00:00Z";
}

std::string trim(const std::string& str) {
    size_t first = str.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) return "";
    size_t last = str.find_last_not_of(" \t\r\n");
    return str.substr(first, (last - first + 1));
}

std::string normalizePath(const std::string& p) {
    std::string result = p;
    std::replace(result.begin(), result.end(), '\\', '/');
    while (result.length() > 1 && result.back() == '/') {
        result.pop_back();
    }
    return result;
}

std::string getBaseName(const std::string& path) {
    size_t pos = path.find_last_of("/\\");
    if (pos == std::string::npos) return path;
    return path.substr(pos + 1);
}

std::string escapeJsonString(const std::string& input) {
    std::ostringstream ss;
    for (char c : input) {
        switch (c) {
            case '"':  ss << "\\\""; break;
            case '\\': ss << "\\\\"; break;
            case '\b': ss << "\\b"; break;
            case '\f': ss << "\\f"; break;
            case '\n': ss << "\\n"; break;
            case '\r': ss << "\\r"; break;
            case '\t': ss << "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) < 32) {
                    char hexBuf[7];
                    snprintf(hexBuf, sizeof(hexBuf), "\\u%04x", static_cast<unsigned char>(c));
                    ss << hexBuf;
                } else {
                    ss << c;
                }
                break;
        }
    }
    return ss.str();
}

bool simpleWildcardMatch(const std::string& pattern, const std::string& text) {
    if (pattern.empty()) return text.empty();
    if (pattern == "*") return true;

    if (pattern.rfind("*.", 0) == 0) {
        std::string suffix = pattern.substr(1);
        if (text.length() >= suffix.length()) {
            return text.compare(text.length() - suffix.length(), suffix.length(), suffix) == 0;
        }
        return false;
    }

    if (!pattern.empty() && pattern.back() == '*') {
        std::string prefix = pattern.substr(0, pattern.length() - 1);
        return text.rfind(prefix, 0) == 0;
    }

    return pattern == text;
}

} // namespace

std::string skipReasonToString(SkipReason reason) {
    switch (reason) {
        case SkipReason::EXCLUDED_DIRECTORY:   return "EXCLUDED_DIRECTORY";
        case SkipReason::UNSUPPORTED_EXTENSION:return "UNSUPPORTED_EXTENSION";
        case SkipReason::BINARY_FILE:          return "BINARY_FILE";
        case SkipReason::MINIFIED_OR_GENERATED:return "MINIFIED_OR_GENERATED";
        case SkipReason::EXCEEDS_SIZE_LIMIT:   return "EXCEEDS_SIZE_LIMIT";
        case SkipReason::UNREADABLE_FILE:      return "UNREADABLE_FILE";
        case SkipReason::GITIGNORED:           return "GITIGNORED";
    }
    return "UNKNOWN";
}

DirectoryScanner::DirectoryScanner(const ScanConfig& config)
    : config_(config) {}

bool DirectoryScanner::isBinaryFile(const std::string& filePath) {
    std::ifstream file(filePath.c_str(), std::ios::in | std::ios::binary);
    if (!file.is_open()) return false;

    constexpr size_t bufferSize = 4096;
    char buffer[bufferSize];
    file.read(buffer, bufferSize);
    std::streamsize bytesRead = file.gcount();

    if (bytesRead == 0) return false;

    size_t nonPrintableCount = 0;
    for (std::streamsize i = 0; i < bytesRead; ++i) {
        unsigned char byte = static_cast<unsigned char>(buffer[i]);

        if (byte == '\0') {
            return true;
        }

        if (byte < 0x09 || (byte > 0x0D && byte < 0x20)) {
            nonPrintableCount++;
        }
    }

    return (nonPrintableCount * 100 / static_cast<size_t>(bytesRead)) > 30;
}

bool DirectoryScanner::isMinifiedOrGenerated(const std::string& fileName, size_t maxLineLen) {
    std::string lowerName = fileName;
    std::transform(lowerName.begin(), lowerName.end(), lowerName.begin(), ::tolower);

    if (lowerName.find(".min.") != std::string::npos ||
        lowerName.find(".bundle.") != std::string::npos ||
        lowerName.find(".min-") != std::string::npos ||
        lowerName.find("-min.") != std::string::npos ||
        lowerName.find(".compiled.") != std::string::npos ||
        lowerName.find(".generated.") != std::string::npos) {
        return true;
    }

    if (maxLineLen > 1000) {
        return true;
    }

    return false;
}

void DirectoryScanner::loadGitignore(const std::string& rootDirectory) {
    gitignorePatterns_.clear();
    std::string gitignorePath = rootDirectory + "/.gitignore";
    std::ifstream file(gitignorePath.c_str());
    if (!file.is_open()) return;

    std::string line;
    while (std::getline(file, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        std::string pattern = trim(line);
        if (pattern.empty() || pattern[0] == '#') continue;

        if (pattern[0] == '/') pattern = pattern.substr(1);
        if (!pattern.empty()) {
            gitignorePatterns_.push_back(normalizePath(pattern));
        }
    }
}

bool DirectoryScanner::isGitignored(const std::string& relativePath) const {
    if (gitignorePatterns_.empty()) return false;

    std::string normRel = normalizePath(relativePath);
    std::string base = getBaseName(normRel);

    for (const auto& pattern : gitignorePatterns_) {
        std::string patClean = pattern;
        if (!patClean.empty() && patClean.back() == '/') {
            patClean.pop_back();
        }

        if (normRel == patClean || normRel.rfind(patClean + "/", 0) == 0) {
            return true;
        }

        if (simpleWildcardMatch(patClean, base) || simpleWildcardMatch(patClean, normRel)) {
            return true;
        }

        size_t foundPos = normRel.find(patClean);
        if (foundPos != std::string::npos) {
            bool leftBoundary = (foundPos == 0 || normRel[foundPos - 1] == '/');
            size_t endPos = foundPos + patClean.length();
            bool rightBoundary = (endPos == normRel.length() || normRel[endPos] == '/');
            if (leftBoundary && rightBoundary) {
                return true;
            }
        }
    }

    return false;
}

bool DirectoryScanner::isExcludedDirectory(const std::string& dirName) const {
    static const std::vector<std::string> defaultExcluded = {
        ".git", ".svn", ".hg", "node_modules", "vendor", "bower_components",
        "build", "bin", "obj", "dist", "out", "target",
        ".vscode", ".idea", ".vs", ".settings",
        "cmake-build-debug", "cmake-build-release",
        ".gemini", "coverage", ".next", ".nuxt", "tmp", "temp"
    };

    for (const auto& exc : defaultExcluded) {
        if (dirName == exc) return true;
    }

    for (const auto& exc : config_.additionalExcludedDirs) {
        if (dirName == exc) return true;
    }

    return false;
}

bool DirectoryScanner::isSupportedSourceFile(const std::string& filename, std::string& outLang, std::string& outExt) const {
    size_t dotPos = filename.find_last_of('.');
    if (dotPos == std::string::npos) return false;

    std::string ext = filename.substr(dotPos);
    std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
    outExt = ext;

    if (ext == ".cpp" || ext == ".hpp" || ext == ".cc" || ext == ".cxx" ||
        ext == ".c" || ext == ".h" || ext == ".hh" || ext == ".hxx") {
        outLang = "cpp";
        return true;
    }

    if (ext == ".js" || ext == ".jsx" || ext == ".mjs" || ext == ".cjs") {
        outLang = "javascript";
        return true;
    }

    if (ext == ".ts" || ext == ".tsx") {
        outLang = "typescript";
        return true;
    }

    return false;
}

LineAnalysisResult DirectoryScanner::analyzeFileLines(const std::string& fullPath, const std::string& language, size_t maxLineThreshold) {
    LineAnalysisResult result;
    std::ifstream file(fullPath.c_str(), std::ios::in | std::ios::binary);
    if (!file.is_open()) return result;

    enum ParserState {
        STATE_NORMAL,
        STATE_STRING_DOUBLE,    // "..."
        STATE_STRING_SINGLE,    // '...'
        STATE_STRING_TEMPLATE,  // `...` (JavaScript / TypeScript)
        STATE_BLOCK_COMMENT     // /* ... */
    };

    ParserState state = STATE_NORMAL;
    std::string line;

    while (std::getline(file, line)) {
        if (!line.empty() && line.back() == '\r') {
            line.pop_back();
        }

        result.totalLines++;
        size_t len = line.length();
        if (len > result.maxLineLength) {
            result.maxLineLength = len;
        }
        if (len > maxLineThreshold) {
            result.hasLongLines = true;
        }

        bool hasCodeOnLine = false;
        bool hasCommentOnLine = false;

        for (size_t i = 0; i < len; ++i) {
            char c = line[i];
            char nextC = (i + 1 < len) ? line[i + 1] : '\0';

            switch (state) {
                case STATE_NORMAL: {
                    if (std::isspace(static_cast<unsigned char>(c))) {
                        continue;
                    }
                    if (c == '/' && nextC == '/') {
                        hasCommentOnLine = true;
                        i = len;
                        break;
                    }
                    if (c == '/' && nextC == '*') {
                        hasCommentOnLine = true;
                        state = STATE_BLOCK_COMMENT;
                        i++;
                        break;
                    }
                    if (c == '"') {
                        hasCodeOnLine = true;
                        state = STATE_STRING_DOUBLE;
                        break;
                    }
                    if (c == '\'') {
                        hasCodeOnLine = true;
                        state = STATE_STRING_SINGLE;
                        break;
                    }
                    if (c == '`' && (language == "javascript" || language == "typescript")) {
                        hasCodeOnLine = true;
                        state = STATE_STRING_TEMPLATE;
                        break;
                    }
                    hasCodeOnLine = true;
                    break;
                }

                case STATE_STRING_DOUBLE: {
                    hasCodeOnLine = true;
                    if (c == '\\') {
                        i++;
                    } else if (c == '"') {
                        state = STATE_NORMAL;
                    }
                    break;
                }

                case STATE_STRING_SINGLE: {
                    hasCodeOnLine = true;
                    if (c == '\\') {
                        i++;
                    } else if (c == '\'') {
                        state = STATE_NORMAL;
                    }
                    break;
                }

                case STATE_STRING_TEMPLATE: {
                    hasCodeOnLine = true;
                    if (c == '\\') {
                        i++;
                    } else if (c == '`') {
                        state = STATE_NORMAL;
                    }
                    break;
                }

                case STATE_BLOCK_COMMENT: {
                    hasCommentOnLine = true;
                    if (c == '*' && nextC == '/') {
                        state = STATE_NORMAL;
                        i++;
                    }
                    break;
                }
            }
        }

        if (!hasCodeOnLine && !hasCommentOnLine) {
            result.blankLines++;
        } else if (hasCodeOnLine && hasCommentOnLine) {
            result.mixedLines++;
            result.codeLines++;
            result.commentLines++;
        } else if (hasCodeOnLine) {
            result.codeLines++;
        } else {
            result.commentLines++;
        }
    }

    return result;
}

void DirectoryScanner::scanRecursive(const std::string& currentPath, const std::string& rootPath, ScanResult& result) {
    if (visitedCanonicalPaths_.find(currentPath) != visitedCanonicalPaths_.end()) {
        return;
    }
    visitedCanonicalPaths_.insert(currentPath);

#if defined(_WIN32)
    std::string searchPattern = currentPath + "/*";
    WIN32_FIND_DATAA findData;
    HANDLE hFind = FindFirstFileA(searchPattern.c_str(), &findData);

    if (hFind == INVALID_HANDLE_VALUE) {
        result.errors.push_back("Could not open directory: " + currentPath);
        return;
    }

    do {
        const std::string entryName = findData.cFileName;
        if (entryName == "." || entryName == "..") {
            continue;
        }

        std::string fullPath = currentPath + "/" + entryName;
        std::string relPath = fullPath;
        if (relPath.rfind(rootPath, 0) == 0) {
            relPath = relPath.substr(rootPath.length());
            if (!relPath.empty() && relPath[0] == '/') {
                relPath = relPath.substr(1);
            }
        }

        if (findData.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            if (isExcludedDirectory(entryName)) {
                SkippedFileInfo info;
                info.relativePath = relPath;
                info.absolutePath = normalizePath(fullPath);
                info.reason = skipReasonToString(SkipReason::EXCLUDED_DIRECTORY);
                info.details = "Directory in standard exclusion list";
                result.skippedFiles.push_back(info);
                continue;
            }

            if (config_.respectGitignore && isGitignored(relPath)) {
                SkippedFileInfo info;
                info.relativePath = relPath;
                info.absolutePath = normalizePath(fullPath);
                info.reason = skipReasonToString(SkipReason::GITIGNORED);
                info.details = "Ignored by repository .gitignore pattern";
                result.skippedFiles.push_back(info);
                continue;
            }

            scanRecursive(fullPath, rootPath, result);
        } else {
            std::string lang, ext;
            if (!isSupportedSourceFile(entryName, lang, ext)) {
                SkippedFileInfo info;
                info.relativePath = relPath;
                info.absolutePath = normalizePath(fullPath);
                info.reason = skipReasonToString(SkipReason::UNSUPPORTED_EXTENSION);
                info.details = "Extension not recognized as supported source code";
                result.skippedFiles.push_back(info);
                continue;
            }

            if (config_.respectGitignore && isGitignored(relPath)) {
                SkippedFileInfo info;
                info.relativePath = relPath;
                info.absolutePath = normalizePath(fullPath);
                info.reason = skipReasonToString(SkipReason::GITIGNORED);
                info.details = "Ignored by .gitignore pattern";
                result.skippedFiles.push_back(info);
                continue;
            }

            stat_struct st;
            if (stat_func(fullPath.c_str(), &st) != 0) {
                SkippedFileInfo info;
                info.relativePath = relPath;
                info.absolutePath = normalizePath(fullPath);
                info.reason = skipReasonToString(SkipReason::UNREADABLE_FILE);
                info.details = "Filesystem stat error accessing file";
                result.skippedFiles.push_back(info);
                continue;
            }

            uint64_t fileSize = static_cast<uint64_t>(st.st_size);
            if (fileSize > config_.maxFileSizeBytes) {
                SkippedFileInfo info;
                info.relativePath = relPath;
                info.absolutePath = normalizePath(fullPath);
                info.reason = skipReasonToString(SkipReason::EXCEEDS_SIZE_LIMIT);
                info.details = "File size exceeds configured limit of " + std::to_string(config_.maxFileSizeBytes) + " bytes";
                result.skippedFiles.push_back(info);
                continue;
            }

            if (isBinaryFile(fullPath)) {
                SkippedFileInfo info;
                info.relativePath = relPath;
                info.absolutePath = normalizePath(fullPath);
                info.reason = skipReasonToString(SkipReason::BINARY_FILE);
                info.details = "Detected non-printable or null bytes in file content";
                result.skippedFiles.push_back(info);
                continue;
            }

            LineAnalysisResult lineStats = analyzeFileLines(fullPath, lang, config_.maxLineLengthThreshold);

            if (isMinifiedOrGenerated(entryName, lineStats.maxLineLength)) {
                SkippedFileInfo info;
                info.relativePath = relPath;
                info.absolutePath = normalizePath(fullPath);
                info.reason = skipReasonToString(SkipReason::MINIFIED_OR_GENERATED);
                info.details = "File matches minified naming pattern or contains line exceeding " + std::to_string(config_.maxLineLengthThreshold) + " chars";
                result.skippedFiles.push_back(info);
                continue;
            }

            FileMetrics metrics;
            metrics.relativePath = normalizePath(relPath);
            metrics.absolutePath = normalizePath(fullPath);
            metrics.fileName = entryName;
            metrics.extension = ext;
            metrics.language = lang;
            metrics.totalLines = lineStats.totalLines;
            metrics.codeLines = lineStats.codeLines;
            metrics.commentLines = lineStats.commentLines;
            metrics.blankLines = lineStats.blankLines;
            metrics.mixedLines = lineStats.mixedLines;
            metrics.maxLineLength = lineStats.maxLineLength;
            metrics.hasLongLines = lineStats.hasLongLines;
            metrics.fileSizeBytes = fileSize;

            // Phase 3 AST parsing for functions and complexity
            std::ifstream srcFile(fullPath.c_str(), std::ios::in | std::ios::binary);
            if (srcFile.is_open()) {
                std::string sourceContent((std::istreambuf_iterator<char>(srcFile)), std::istreambuf_iterator<char>());
                metrics.complexity = astParser_.analyzeSource(sourceContent, lang);
            }

            result.files.push_back(metrics);
            result.summary.totalFilesScanned++;
            result.summary.totalLines += metrics.totalLines;
            result.summary.totalCodeLines += metrics.codeLines;
            result.summary.totalCommentLines += metrics.commentLines;
            result.summary.totalBlankLines += metrics.blankLines;
            result.summary.totalMixedLines += metrics.mixedLines;
            result.summary.totalSizeBytes += fileSize;
            result.summary.filesByLanguage[lang]++;
            result.summary.linesByLanguage[lang] += metrics.totalLines;

            // Aggregate function & complexity metrics
            result.summary.totalFunctions += metrics.complexity.totalFunctions;
            if (metrics.complexity.maxComplexity > result.summary.maxComplexity) {
                result.summary.maxComplexity = metrics.complexity.maxComplexity;
            }
            result.summary.highComplexityFunctionCount += metrics.complexity.complexFunctionCount;
        }
    } while (FindNextFileA(hFind, &findData) != 0);

    FindClose(hFind);
#else
    DIR* dir = opendir(currentPath.c_str());
    if (!dir) {
        result.errors.push_back("Could not open directory: " + currentPath);
        return;
    }

    struct dirent* entry;
    while ((entry = readdir(dir)) != nullptr) {
        const std::string entryName = entry->d_name;
        if (entryName == "." || entryName == "..") {
            continue;
        }

        std::string fullPath = currentPath + "/" + entryName;
        std::string relPath = fullPath;
        if (relPath.rfind(rootPath, 0) == 0) {
            relPath = relPath.substr(rootPath.length());
            if (!relPath.empty() && relPath[0] == '/') {
                relPath = relPath.substr(1);
            }
        }

        stat_struct st;
        if (stat_func(fullPath.c_str(), &st) != 0) {
            SkippedFileInfo info;
            info.relativePath = relPath;
            info.absolutePath = normalizePath(fullPath);
            info.reason = skipReasonToString(SkipReason::UNREADABLE_FILE);
            info.details = "Filesystem stat error accessing file";
            result.skippedFiles.push_back(info);
            continue;
        }

        if (S_ISDIR(st.st_mode)) {
            if (isExcludedDirectory(entryName)) {
                SkippedFileInfo info;
                info.relativePath = relPath;
                info.absolutePath = normalizePath(fullPath);
                info.reason = skipReasonToString(SkipReason::EXCLUDED_DIRECTORY);
                info.details = "Directory in standard exclusion list";
                result.skippedFiles.push_back(info);
                continue;
            }

            if (config_.respectGitignore && isGitignored(relPath)) {
                SkippedFileInfo info;
                info.relativePath = relPath;
                info.absolutePath = normalizePath(fullPath);
                info.reason = skipReasonToString(SkipReason::GITIGNORED);
                info.details = "Ignored by repository .gitignore pattern";
                result.skippedFiles.push_back(info);
                continue;
            }

            scanRecursive(fullPath, rootPath, result);
        } else if (S_ISREG(st.st_mode)) {
            std::string lang, ext;
            if (!isSupportedSourceFile(entryName, lang, ext)) {
                SkippedFileInfo info;
                info.relativePath = relPath;
                info.absolutePath = normalizePath(fullPath);
                info.reason = skipReasonToString(SkipReason::UNSUPPORTED_EXTENSION);
                info.details = "Extension not recognized as supported source code";
                result.skippedFiles.push_back(info);
                continue;
            }

            if (config_.respectGitignore && isGitignored(relPath)) {
                SkippedFileInfo info;
                info.relativePath = relPath;
                info.absolutePath = normalizePath(fullPath);
                info.reason = skipReasonToString(SkipReason::GITIGNORED);
                info.details = "Ignored by .gitignore pattern";
                result.skippedFiles.push_back(info);
                continue;
            }

            uint64_t fileSize = static_cast<uint64_t>(st.st_size);
            if (fileSize > config_.maxFileSizeBytes) {
                SkippedFileInfo info;
                info.relativePath = relPath;
                info.absolutePath = normalizePath(fullPath);
                info.reason = skipReasonToString(SkipReason::EXCEEDS_SIZE_LIMIT);
                info.details = "File size exceeds configured limit of " + std::to_string(config_.maxFileSizeBytes) + " bytes";
                result.skippedFiles.push_back(info);
                continue;
            }

            if (isBinaryFile(fullPath)) {
                SkippedFileInfo info;
                info.relativePath = relPath;
                info.absolutePath = normalizePath(fullPath);
                info.reason = skipReasonToString(SkipReason::BINARY_FILE);
                info.details = "Detected non-printable or null bytes in file content";
                result.skippedFiles.push_back(info);
                continue;
            }

            LineAnalysisResult lineStats = analyzeFileLines(fullPath, lang, config_.maxLineLengthThreshold);

            if (isMinifiedOrGenerated(entryName, lineStats.maxLineLength)) {
                SkippedFileInfo info;
                info.relativePath = relPath;
                info.absolutePath = normalizePath(fullPath);
                info.reason = skipReasonToString(SkipReason::MINIFIED_OR_GENERATED);
                info.details = "File matches minified naming pattern or contains line exceeding " + std::to_string(config_.maxLineLengthThreshold) + " chars";
                result.skippedFiles.push_back(info);
                continue;
            }

            FileMetrics metrics;
            metrics.relativePath = normalizePath(relPath);
            metrics.absolutePath = normalizePath(fullPath);
            metrics.fileName = entryName;
            metrics.extension = ext;
            metrics.language = lang;
            metrics.totalLines = lineStats.totalLines;
            metrics.codeLines = lineStats.codeLines;
            metrics.commentLines = lineStats.commentLines;
            metrics.blankLines = lineStats.blankLines;
            metrics.mixedLines = lineStats.mixedLines;
            metrics.maxLineLength = lineStats.maxLineLength;
            metrics.hasLongLines = lineStats.hasLongLines;
            metrics.fileSizeBytes = fileSize;

            std::ifstream srcFile(fullPath.c_str(), std::ios::in | std::ios::binary);
            if (srcFile.is_open()) {
                std::string sourceContent((std::istreambuf_iterator<char>(srcFile)), std::istreambuf_iterator<char>());
                metrics.complexity = astParser_.analyzeSource(sourceContent, lang);
            }

            result.files.push_back(metrics);
            result.summary.totalFilesScanned++;
            result.summary.totalLines += metrics.totalLines;
            result.summary.totalCodeLines += metrics.codeLines;
            result.summary.totalCommentLines += metrics.commentLines;
            result.summary.totalBlankLines += metrics.blankLines;
            result.summary.totalMixedLines += metrics.mixedLines;
            result.summary.totalSizeBytes += fileSize;
            result.summary.filesByLanguage[lang]++;
            result.summary.linesByLanguage[lang] += metrics.totalLines;

            result.summary.totalFunctions += metrics.complexity.totalFunctions;
            if (metrics.complexity.maxComplexity > result.summary.maxComplexity) {
                result.summary.maxComplexity = metrics.complexity.maxComplexity;
            }
            result.summary.highComplexityFunctionCount += metrics.complexity.complexFunctionCount;
        }
    }
    closedir(dir);
#endif
}

ScanResult DirectoryScanner::scan(const std::string& rootDirectory) {
    ScanResult result;
    result.engineVersion = "1.2.0";
    std::string normRoot = normalizePath(rootDirectory);
    result.repoPath = normRoot;
    result.scanTimestamp = getIsoTimestamp();

    visitedCanonicalPaths_.clear();

    if (config_.respectGitignore) {
        loadGitignore(normRoot);
    }

    scanRecursive(normRoot, normRoot, result);

    result.summary.skippedFilesCount = result.skippedFiles.size();
    result.summary.errorCount = result.errors.size();

    // Compute repository-wide average complexity
    if (result.summary.totalFunctions > 0) {
        double sumComp = 0.0;
        for (const auto& file : result.files) {
            for (const auto& fn : file.complexity.functions) {
                sumComp += static_cast<double>(fn.cyclomaticComplexity);
            }
        }
        result.summary.averageComplexity = sumComp / static_cast<double>(result.summary.totalFunctions);
    }

    return result;
}

std::string DirectoryScanner::serializeToJson(const ScanResult& result) {
    std::ostringstream ss;
    ss << "{\n";
    ss << "  \"engineVersion\": \"" << escapeJsonString(result.engineVersion) << "\",\n";
    ss << "  \"repoPath\": \"" << escapeJsonString(result.repoPath) << "\",\n";
    ss << "  \"scanTimestamp\": \"" << escapeJsonString(result.scanTimestamp) << "\",\n";

    // Summary
    ss << "  \"summary\": {\n";
    ss << "    \"totalFiles\": " << result.summary.totalFilesScanned << ",\n";
    ss << "    \"totalLines\": " << result.summary.totalLines << ",\n";
    ss << "    \"totalCodeLines\": " << result.summary.totalCodeLines << ",\n";
    ss << "    \"totalCommentLines\": " << result.summary.totalCommentLines << ",\n";
    ss << "    \"totalBlankLines\": " << result.summary.totalBlankLines << ",\n";
    ss << "    \"totalMixedLines\": " << result.summary.totalMixedLines << ",\n";
    ss << "    \"totalSizeBytes\": " << result.summary.totalSizeBytes << ",\n";
    ss << "    \"skippedFilesCount\": " << result.summary.skippedFilesCount << ",\n";
    ss << "    \"errorCount\": " << result.summary.errorCount << ",\n";

    // Phase 3 AST summary metrics
    ss << "    \"totalFunctions\": " << result.summary.totalFunctions << ",\n";
    ss << "    \"averageComplexity\": " << result.summary.averageComplexity << ",\n";
    ss << "    \"maxComplexity\": " << result.summary.maxComplexity << ",\n";
    ss << "    \"highComplexityFunctionCount\": " << result.summary.highComplexityFunctionCount << ",\n";

    // filesByLanguage
    ss << "    \"filesByLanguage\": {";
    size_t langIdx = 0;
    for (const auto& kv : result.summary.filesByLanguage) {
        ss << "\"" << escapeJsonString(kv.first) << "\": " << kv.second;
        if (++langIdx < result.summary.filesByLanguage.size()) ss << ", ";
    }
    ss << "},\n";

    // linesByLanguage
    ss << "    \"linesByLanguage\": {";
    langIdx = 0;
    for (const auto& kv : result.summary.linesByLanguage) {
        ss << "\"" << escapeJsonString(kv.first) << "\": " << kv.second;
        if (++langIdx < result.summary.linesByLanguage.size()) ss << ", ";
    }
    ss << "}\n";
    ss << "  },\n";

    // Analyzed Files
    ss << "  \"files\": [\n";
    for (size_t i = 0; i < result.files.size(); ++i) {
        const auto& f = result.files[i];
        ss << "    {\n";
        ss << "      \"relativePath\": \"" << escapeJsonString(f.relativePath) << "\",\n";
        ss << "      \"absolutePath\": \"" << escapeJsonString(f.absolutePath) << "\",\n";
        ss << "      \"fileName\": \"" << escapeJsonString(f.fileName) << "\",\n";
        ss << "      \"extension\": \"" << escapeJsonString(f.extension) << "\",\n";
        ss << "      \"language\": \"" << escapeJsonString(f.language) << "\",\n";
        ss << "      \"totalLines\": " << f.totalLines << ",\n";
        ss << "      \"codeLines\": " << f.codeLines << ",\n";
        ss << "      \"commentLines\": " << f.commentLines << ",\n";
        ss << "      \"blankLines\": " << f.blankLines << ",\n";
        ss << "      \"mixedLines\": " << f.mixedLines << ",\n";
        ss << "      \"maxLineLength\": " << f.maxLineLength << ",\n";
        ss << "      \"hasLongLines\": " << (f.hasLongLines ? "true" : "false") << ",\n";
        ss << "      \"fileSizeBytes\": " << f.fileSizeBytes << ",\n";

        // Phase 3 AST Complexity Breakdown for file
        ss << "      \"complexitySummary\": {\n";
        ss << "        \"totalFunctions\": " << f.complexity.totalFunctions << ",\n";
        ss << "        \"averageComplexity\": " << f.complexity.averageComplexity << ",\n";
        ss << "        \"maxComplexity\": " << f.complexity.maxComplexity << ",\n";
        ss << "        \"maxNestingDepth\": " << f.complexity.maxNestingDepth << ",\n";
        ss << "        \"complexFunctionCount\": " << f.complexity.complexFunctionCount << "\n";
        ss << "      },\n";

        // Functions in file
        ss << "      \"functions\": [\n";
        for (size_t j = 0; j < f.complexity.functions.size(); ++j) {
            const auto& fn = f.complexity.functions[j];
            ss << "        {\n";
            ss << "          \"name\": \"" << escapeJsonString(fn.name) << "\",\n";
            ss << "          \"startLine\": " << fn.startLine << ",\n";
            ss << "          \"endLine\": " << fn.endLine << ",\n";
            ss << "          \"startColumn\": " << fn.startColumn << ",\n";
            ss << "          \"endColumn\": " << fn.endColumn << ",\n";
            ss << "          \"lineCount\": " << fn.lineCount << ",\n";
            ss << "          \"parameterCount\": " << fn.parameterCount << ",\n";
            ss << "          \"cyclomaticComplexity\": " << fn.cyclomaticComplexity << ",\n";
            ss << "          \"maxNestingDepth\": " << fn.maxNestingDepth << ",\n";
            ss << "          \"isHighComplexity\": " << (fn.isHighComplexity ? "true" : "false") << "\n";
            ss << "        }" << (j + 1 < f.complexity.functions.size() ? ",\n" : "\n");
        }
        ss << "      ]\n";

        ss << "    }" << (i + 1 < result.files.size() ? ",\n" : "\n");
    }
    ss << "  ],\n";

    // Skipped Files
    ss << "  \"skippedFiles\": [\n";
    for (size_t i = 0; i < result.skippedFiles.size(); ++i) {
        const auto& sk = result.skippedFiles[i];
        ss << "    {\n";
        ss << "      \"relativePath\": \"" << escapeJsonString(sk.relativePath) << "\",\n";
        ss << "      \"reason\": \"" << escapeJsonString(sk.reason) << "\",\n";
        ss << "      \"details\": \"" << escapeJsonString(sk.details) << "\"\n";
        ss << "    }" << (i + 1 < result.skippedFiles.size() ? ",\n" : "\n");
    }
    ss << "  ],\n";

    // Errors
    ss << "  \"errors\": [\n";
    for (size_t i = 0; i < result.errors.size(); ++i) {
        ss << "    \"" << escapeJsonString(result.errors[i]) << "\"" << (i + 1 < result.errors.size() ? ",\n" : "\n");
    }
    ss << "  ]\n";
    ss << "}\n";

    return ss.str();
}

} // namespace codeinsight
