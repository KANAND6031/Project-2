#include "../include/scanner.hpp"

#include <iostream>
#include <cassert>
#include <cstdlib>

void runTests() {
    std::cout << "[Test Suite] Running CodeInsight Phase 2 Scanner Unit Tests...\n";

    // Test 1: Binary file detection
    {
        std::cout << "  - Testing isBinaryFile()... ";
        bool isBin = codeinsight::DirectoryScanner::isBinaryFile("test-fixtures/complex-repo/corrupt_binary.cpp");
        bool isNotBin = codeinsight::DirectoryScanner::isBinaryFile("test-fixtures/complex-repo/edge_cases.cpp");

        if (isBin && !isNotBin) {
            std::cout << "PASSED\n";
        } else {
            std::cerr << "FAILED! isBin=" << isBin << ", isNotBin=" << isNotBin << "\n";
            std::exit(1);
        }
    }

    // Test 2: Minified file detection
    {
        std::cout << "  - Testing isMinifiedOrGenerated()... ";
        bool minFile = codeinsight::DirectoryScanner::isMinifiedOrGenerated("bundle.min.js", 1500);
        bool regularFile = codeinsight::DirectoryScanner::isMinifiedOrGenerated("calculator.cpp", 60);

        if (minFile && !regularFile) {
            std::cout << "PASSED\n";
        } else {
            std::cerr << "FAILED!\n";
            std::exit(1);
        }
    }

    // Test 3: Lexical line counting on edge_cases.cpp
    {
        std::cout << "  - Testing analyzeFileLines() on edge_cases.cpp... ";
        auto stats = codeinsight::DirectoryScanner::analyzeFileLines("test-fixtures/complex-repo/edge_cases.cpp", "cpp", 1000);

        bool ok = (stats.totalLines == 17) &&
                  (stats.codeLines == 10) &&
                  (stats.commentLines == 6) &&
                  (stats.mixedLines == 2) &&
                  (stats.blankLines == 3);

        if (ok) {
            std::cout << "PASSED (total=" << stats.totalLines 
                      << ", code=" << stats.codeLines 
                      << ", comments=" << stats.commentLines 
                      << ", mixed=" << stats.mixedLines 
                      << ", blank=" << stats.blankLines << ")\n";
        } else {
            std::cerr << "FAILED! Got total=" << stats.totalLines 
                      << ", code=" << stats.codeLines 
                      << ", comments=" << stats.commentLines 
                      << ", mixed=" << stats.mixedLines 
                      << ", blank=" << stats.blankLines << "\n";
            std::exit(1);
        }
    }

    // Test 4: Full directory scan
    {
        std::cout << "  - Testing full directory scan on complex-repo... ";
        codeinsight::ScanConfig cfg;
        codeinsight::DirectoryScanner scanner(cfg);
        auto result = scanner.scan("test-fixtures/complex-repo");

        if (result.summary.totalFilesScanned == 2 && result.summary.skippedFilesCount >= 5) {
            std::cout << "PASSED (" << result.summary.totalFilesScanned << " files analyzed, " 
                      << result.summary.skippedFilesCount << " skipped)\n";
        } else {
            std::cerr << "FAILED! totalFilesScanned=" << result.summary.totalFilesScanned << "\n";
            std::exit(1);
        }
    }

    std::cout << "\n[ALL TESTS PASSED SUCCESSFULLY]\n";
}

int main() {
    runTests();
    return 0;
}
