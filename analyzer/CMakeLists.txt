cmake_minimum_required(VERSION 3.15)
project(CodeInsightAnalyzer VERSION 1.2.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED OFF)
set(CMAKE_CXX_EXTENSIONS OFF)

# Compiler warnings
if(MSVC)
    add_compile_options(/W4 /EHsc)
else()
    add_compile_options(-Wall -Wextra -pedantic)
endif()

# Tree-sitter Runtime & Grammars
set(TREE_SITTER_DIR "${PROJECT_SOURCE_DIR}/third_party/tree-sitter")
set(GRAMMARS_DIR "${PROJECT_SOURCE_DIR}/third_party/grammars")

set(TREE_SITTER_SOURCES
    ${TREE_SITTER_DIR}/src/lib.c
    ${GRAMMARS_DIR}/c/parser.c
    ${GRAMMARS_DIR}/javascript/parser.c
    ${GRAMMARS_DIR}/javascript/scanner.c
)

add_library(treesitter STATIC ${TREE_SITTER_SOURCES})
target_include_directories(treesitter PUBLIC
    ${TREE_SITTER_DIR}/include
    ${TREE_SITTER_DIR}/src
    ${GRAMMARS_DIR}/c
    ${GRAMMARS_DIR}/javascript
)

# Core library source files
set(SCANNER_SOURCES
    src/scanner.cpp
    src/ast_parser.cpp
    src/duplicate_detector.cpp
)

set(SCANNER_HEADERS
    include/scanner.hpp
    include/ast_parser.hpp
    include/duplicate_detector.hpp
)

# Standalone CLI Executable
add_executable(codeinsight-analyzer src/main.cpp ${SCANNER_SOURCES} ${SCANNER_HEADERS})
target_include_directories(codeinsight-analyzer PRIVATE
    ${PROJECT_SOURCE_DIR}/include
    ${TREE_SITTER_DIR}/include
)
target_link_libraries(codeinsight-analyzer PRIVATE treesitter)
set_target_properties(codeinsight-analyzer PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin")

# Unit Test Executable: Scanner
add_executable(test-scanner tests/test_scanner.cpp ${SCANNER_SOURCES} ${SCANNER_HEADERS})
target_include_directories(test-scanner PRIVATE
    ${PROJECT_SOURCE_DIR}/include
    ${TREE_SITTER_DIR}/include
)
target_link_libraries(test-scanner PRIVATE treesitter)
set_target_properties(test-scanner PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin")

# Unit Test Executable: Duplicates
add_executable(test-duplicates tests/test_duplicates.cpp ${SCANNER_SOURCES} ${SCANNER_HEADERS})
target_include_directories(test-duplicates PRIVATE
    ${PROJECT_SOURCE_DIR}/include
    ${TREE_SITTER_DIR}/include
)
target_link_libraries(test-duplicates PRIVATE treesitter)
set_target_properties(test-duplicates PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin")
