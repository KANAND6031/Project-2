// calculator.cpp - Sample C++ file for CodeInsight scanner verification
#include <iostream>

// Adds two integers
int add(int a, int b) {
    return a + b;
}

// Multiplies two integers
int multiply(int a, int b) {
    int result = 0;
    for (int i = 0; i < b; ++i) {
        result += a;
    }
    return result;
}

int main() {
    std::cout << "Sum: " << add(5, 7) << std::endl;
    std::cout << "Product: " << multiply(5, 7) << std::endl;
    return 0;
}
