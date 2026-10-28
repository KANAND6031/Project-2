#include "../include/duplicate_detector.hpp"

#include <iostream>
#include <cassert>
#include <cstdlib>

int main() {
    std::cout << "[Test Suite] Running CodeInsight Phase 4 C++ Duplicate Detection Tests...\n";

    // Test 1: Line Normalization
    {
        std::cout << "  - Testing normalizeLine()... ";
        std::string raw = "   int   x  =    a   +   b;   ";
        std::string norm = codeinsight::DuplicateDetector::normalizeLine(raw);
        if (norm == "int x = a + b;") {
            std::cout << "PASSED\n";
        } else {
            std::cerr << "FAILED! Got: '" << norm << "'\n";
            std::exit(1);
        }
    }

    // Test 2: Detection between 2 source buffers
    {
        std::cout << "  - Testing clone detection across source strings... ";
        std::string fileA = "int a = 1;\nint b = 2;\nint c = a + b;\nint d = c * 2;\nint e = d - 1;\nint f = e + 5;\n";
        std::string fileB = "int x = 100;\nint a = 1;\nint b = 2;\nint c = a + b;\nint d = c * 2;\nint e = d - 1;\nint f = e + 5;\nreturn f;\n";

        std::vector<std::pair<std::string, std::string>> files = {
            {"fileA.cpp", fileA},
            {"fileB.cpp", fileB}
        };
        std::map<std::string, size_t> lineCounts = {
            {"fileA.cpp", 6},
            {"fileB.cpp", 8}
        };

        codeinsight::DuplicateConfig cfg;
        cfg.minBlockLines = 5;
        cfg.minTokenChars = 20;

        codeinsight::DuplicateDetector detector(cfg);
        auto report = detector.analyze(files, lineCounts);

        if (report.totalDuplicateBlocks == 1 && report.totalDuplicateLines == 12) {
            std::cout << "PASSED (1 block detected, 12 total duplicate lines)\n";
        } else {
            std::cerr << "FAILED! totalBlocks=" << report.totalDuplicateBlocks 
                      << ", totalLines=" << report.totalDuplicateLines << "\n";
            std::exit(1);
        }
    }

    std::cout << "\n[ALL C++ PHASE 4 TESTS PASSED SUCCESSFULLY]\n";
    return 0;
}

