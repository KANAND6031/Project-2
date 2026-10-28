cmake_minimum_required(VERSION 3.15)
project(CodeInsightAnalyzer VERSION 1.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED OFF)
set(CMAKE_CXX_EXTENSIONS OFF)

# Compiler warnings
if(MSVC)
    add_compile_options(/W4 /EHsc)
else()
    add_compile_options(-Wall -Wextra -pedantic)
endif()

# Core library source files
set(SCANNER_SOURCES
    src/scanner.cpp
)

set(SCANNER_HEADERS
    include/scanner.hpp
)

# Standalone CLI Executable
add_executable(codeinsight-analyzer src/main.cpp ${SCANNER_SOURCES} ${SCANNER_HEADERS})
target_include_directories(codeinsight-analyzer PRIVATE ${PROJECT_SOURCE_DIR}/include)
set_target_properties(codeinsight-analyzer PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin")

# Unit Test Executable
add_executable(test-scanner tests/test_scanner.cpp ${SCANNER_SOURCES} ${SCANNER_HEADERS})
target_include_directories(test-scanner PRIVATE ${PROJECT_SOURCE_DIR}/include)
set_target_properties(test-scanner PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin")
