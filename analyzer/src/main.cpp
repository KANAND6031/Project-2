#include "../include/scanner.hpp"

#include <iostream>
#include <fstream>
#include <string>

namespace {

void printUsage(const char* progName) {
    std::cout << "CodeInsight Analysis Engine (v1.2.0 - Phase 3 AST Engine)\n"
              << "Usage: " << progName << " --repo <repository_path> [options]\n\n"
              << "Options:\n"
              << "  --repo <path>          Target repository directory to analyze (required)\n"
              << "  --output <path>        Write JSON report to specified file instead of stdout\n"
              << "  --max-size <bytes>     Skip files exceeding byte size (default: 5MB)\n"
              << "  --max-line-len <len>   Threshold for detecting minified files (default: 1000)\n"
              << "  --no-gitignore         Disable automatic .gitignore rule parsing\n"
              << "  --help, -h             Show this help message\n";
}

} // namespace

int main(int argc, char* argv[]) {
    std::string repoPath = "";
    std::string outputPath = "";
    codeinsight::ScanConfig config;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--help" || arg == "-h") {
            printUsage(argv[0]);
            return 0;
        } else if (arg == "--repo" && i + 1 < argc) {
            repoPath = argv[++i];
        } else if (arg == "--output" && i + 1 < argc) {
            outputPath = argv[++i];
        } else if (arg == "--max-size" && i + 1 < argc) {
            config.maxFileSizeBytes = std::stoull(argv[++i]);
        } else if (arg == "--max-line-len" && i + 1 < argc) {
            config.maxLineLengthThreshold = std::stoul(argv[++i]);
        } else if (arg == "--no-gitignore") {
            config.respectGitignore = false;
        } else if (repoPath.empty() && arg.rfind("-", 0) != 0) {
            repoPath = arg;
        }
    }

    if (repoPath.empty()) {
        std::cerr << "Error: Target repository path is required. Use --repo <path>\n";
        printUsage(argv[0]);
        return 1;
    }

    codeinsight::DirectoryScanner scanner(config);
    codeinsight::ScanResult result = scanner.scan(repoPath);

    std::string jsonOutput = codeinsight::DirectoryScanner::serializeToJson(result);

    if (!outputPath.empty()) {
        std::ofstream outFile(outputPath);
        if (!outFile.is_open()) {
            std::cerr << "Error: Unable to open output file for writing: " << outputPath << "\n";
            return 2;
        }
        outFile << jsonOutput;
        outFile.close();
    } else {
        std::cout << jsonOutput;
    }

    return 0;
}
