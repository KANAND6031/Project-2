// complex_functions.cpp - Test fixture for Cyclomatic Complexity & Nesting Depth
#include <iostream>
#include <vector>

// Simple function: Complexity = 1, Nesting = 0
int simpleAdd(int a, int b) {
    return a + b;
}

// Deeply nested function: Nesting = 4, Complexity = 4
void deepNesting(int depth) {
    if (depth > 0) {
        for (int i = 0; i < depth; ++i) {
            while (i < 5) {
                if (i % 2 == 0) {
                    std::cout << "Nested level 4" << std::endl;
                }
                break;
            }
        }
    }
}

// Highly complex function: Complexity = 11, Nesting = 2
int complexDecisionLogic(int mode, int a, int b) {
    int score = 0;

    if (mode == 1 && a > 0) { // +2 (if, &&)
        score += a;
    } else if (mode == 2 || b < 0) { // +2 (else if, ||)
        score += b;
    }

    for (int i = 0; i < 10; ++i) { // +1 (for)
        if (i % 2 == 0) { // +1 (if)
            score += i;
        }
    }

    switch (mode) {
        case 10: // +1 (case)
            score *= 2;
            break;
        case 20: // +1 (case)
            score *= 3;
            break;
        case 30: // +1 (case)
            score *= 4;
            break;
        default:
            score = 0;
            break;
    }

    return score > 100 ? 100 : score; // +1 (ternary)
}

