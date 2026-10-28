// edge_cases.cpp - Line counting edge cases
#include <iostream>
#include <string>

/* Multi-line block start
 * explaining logic
 */ int globalCounter = 0;

int main() {
    int x = 42; // initialize value
    std::string fakeComment = "// this is a string literal, not a comment";
    std::string fakeBlock = "/* also inside string */";

    // print result
    std::cout << x << std::endl;
    return 0;
}
