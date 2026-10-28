#include "../include/ast_parser.hpp"

#include <iostream>
#include <cstring>
#include <algorithm>

extern "C" {
    const TSLanguage *tree_sitter_c(void);
    const TSLanguage *tree_sitter_javascript(void);
}

namespace codeinsight {

AstParser::AstParser() {
    initParsers();
}

AstParser::~AstParser() {
    if (cParser_) {
        ts_parser_delete(cParser_);
        cParser_ = nullptr;
    }
    if (jsParser_) {
        ts_parser_delete(jsParser_);
        jsParser_ = nullptr;
    }
}

void AstParser::initParsers() {
    cParser_ = ts_parser_new();
    if (cParser_) {
        ts_parser_set_language(cParser_, tree_sitter_c());
    }

    jsParser_ = ts_parser_new();
    if (jsParser_) {
        ts_parser_set_language(jsParser_, tree_sitter_javascript());
    }
}

std::string AstParser::extractNodeText(TSNode node, const std::string& sourceCode) const {
    uint32_t startByte = ts_node_start_byte(node);
    uint32_t endByte = ts_node_end_byte(node);

    if (startByte < sourceCode.length() && endByte <= sourceCode.length() && startByte <= endByte) {
        return sourceCode.substr(startByte, endByte - startByte);
    }
    return "";
}

std::string AstParser::extractFunctionName(TSNode funcNode, const std::string& sourceCode, const std::string& language) const {
    std::string nodeType = ts_node_type(funcNode);

    if (language == "cpp" || language == "c") {
        // C/C++: function_definition -> declarator (e.g. function_declarator) -> identifier
        TSNode declarator = ts_node_child_by_field_name(funcNode, "declarator", 10);
        if (ts_node_is_null(declarator)) {
            // Fallback: search children for declarator
            uint32_t childCount = ts_node_child_count(funcNode);
            for (uint32_t i = 0; i < childCount; ++i) {
                TSNode c = ts_node_child(funcNode, i);
                std::string cType = ts_node_type(c);
                if (cType.find("declarator") != std::string::npos) {
                    declarator = c;
                    break;
                }
            }
        }

        while (!ts_node_is_null(declarator)) {
            std::string dType = ts_node_type(declarator);
            if (dType == "identifier" || dType == "field_identifier") {
                return extractNodeText(declarator, sourceCode);
            }
            // If function_declarator, get its child declarator or identifier
            TSNode inner = ts_node_child_by_field_name(declarator, "declarator", 10);
            if (!ts_node_is_null(inner)) {
                declarator = inner;
            } else {
                // Check first child
                if (ts_node_child_count(declarator) > 0) {
                    declarator = ts_node_child(declarator, 0);
                } else {
                    break;
                }
            }
        }
    } else {
        // JavaScript / TypeScript
        if (nodeType == "function_declaration" || nodeType == "function_expression" || nodeType == "method_definition") {
            TSNode nameNode = ts_node_child_by_field_name(funcNode, "name", 4);
            if (!ts_node_is_null(nameNode)) {
                return extractNodeText(nameNode, sourceCode);
            }
        }

        // For arrow_function or anonymous function assigned to a variable: const foo = () => {}
        TSNode parent = ts_node_parent(funcNode);
        if (!ts_node_is_null(parent)) {
            std::string pType = ts_node_type(parent);
            if (pType == "variable_declarator") {
                TSNode nameNode = ts_node_child_by_field_name(parent, "name", 4);
                if (!ts_node_is_null(nameNode)) {
                    return extractNodeText(nameNode, sourceCode);
                }
            } else if (pType == "assignment_expression" || pType == "pair") {
                TSNode keyNode = ts_node_child_by_field_name(parent, "key", 3);
                if (!ts_node_is_null(keyNode)) {
                    return extractNodeText(keyNode, sourceCode);
                }
                TSNode leftNode = ts_node_child_by_field_name(parent, "left", 4);
                if (!ts_node_is_null(leftNode)) {
                    return extractNodeText(leftNode, sourceCode);
                }
            }
        }
    }

    TSPoint pt = ts_node_start_point(funcNode);
    return "anonymous@" + std::to_string(pt.row + 1) + ":" + std::to_string(pt.column + 1);
}

size_t AstParser::countParameters(TSNode funcNode) const {
    // Find parameter list node
    uint32_t childCount = ts_node_child_count(funcNode);
    TSNode paramNode{};

    for (uint32_t i = 0; i < childCount; ++i) {
        TSNode c = ts_node_child(funcNode, i);
        std::string cType = ts_node_type(c);
        if (cType == "parameter_list" || cType == "formal_parameters") {
            paramNode = c;
            break;
        }
        // Sometimes nested inside function_declarator
        if (cType == "function_declarator") {
            uint32_t subCount = ts_node_child_count(c);
            for (uint32_t j = 0; j < subCount; ++j) {
                TSNode sub = ts_node_child(c, j);
                std::string subType = ts_node_type(sub);
                if (subType == "parameter_list") {
                    paramNode = sub;
                    break;
                }
            }
        }
    }

    if (ts_node_is_null(paramNode)) return 0;

    size_t count = 0;
    uint32_t paramChildCount = ts_node_named_child_count(paramNode);

    for (uint32_t i = 0; i < paramChildCount; ++i) {
        TSNode p = ts_node_named_child(paramNode, i);
        std::string pType = ts_node_type(p);
        // Exclude 'void' in C function declarations: int main(void)
        if (pType == "parameter_declaration") {
            if (ts_node_named_child_count(p) == 1) {
                TSNode typeNode = ts_node_named_child(p, 0);
                if (std::string(ts_node_type(typeNode)) == "primitive_type") {
                    // Check if it's "void"
                    uint32_t sb = ts_node_start_byte(typeNode);
                    uint32_t eb = ts_node_end_byte(typeNode);
                    if (eb - sb == 4) {
                        // Could be void, skip if lone void parameter
                        if (paramChildCount == 1) continue;
                    }
                }
            }
            count++;
        } else if (pType == "identifier" || pType == "pattern" || pType == "assignment_pattern" || pType == "rest_pattern") {
            count++;
        }
    }

    return count;
}

bool AstParser::isDecisionPoint(TSNode node, const std::string& sourceCode) const {
    std::string type = ts_node_type(node);

    // Conditional branches
    if (type == "if_statement" ||
        type == "conditional_expression" ||
        type == "ternary_expression") {
        return true;
    }

    // Iteration loops
    if (type == "for_statement" ||
        type == "for_in_statement" ||
        type == "for_of_statement" ||
        type == "while_statement" ||
        type == "do_statement") {
        return true;
    }

    // Selection switch cases (exclude default case)
    if (type == "case_statement" || type == "switch_case") {
        // If it starts with "default", it is not an additional decision branch
        TSNode firstChild = ts_node_child(node, 0);
        if (!ts_node_is_null(firstChild)) {
            std::string firstType = ts_node_type(firstChild);
            if (firstType == "default") return false;
        }
        return true;
    }

    // Binary boolean decision operators: &&, ||, ??
    if (type == "binary_expression" || type == "logical_expression") {
        TSNode opNode = ts_node_child_by_field_name(node, "operator", 8);
        if (!ts_node_is_null(opNode)) {
            std::string opText = extractNodeText(opNode, sourceCode);
            if (opText == "&&" || opText == "||" || opText == "??") {
                return true;
            }
        } else {
            // Inspect middle child
            if (ts_node_child_count(node) >= 2) {
                TSNode op = ts_node_child(node, 1);
                std::string opText = extractNodeText(op, sourceCode);
                if (opText == "&&" || opText == "||" || opText == "??") {
                    return true;
                }
            }
        }
    }

    // Exception handling branches
    if (type == "catch_clause") {
        return true;
    }

    return false;
}

bool AstParser::isNestingControlStructure(TSNode node) const {
    std::string type = ts_node_type(node);
    return (type == "if_statement" ||
            type == "for_statement" ||
            type == "for_in_statement" ||
            type == "for_of_statement" ||
            type == "while_statement" ||
            type == "do_statement" ||
            type == "switch_statement" ||
            type == "try_statement" ||
            type == "catch_clause");
}

void AstParser::computeComplexityAndNesting(TSNode node, const std::string& sourceCode, size_t currentDepth, size_t& complexity, size_t& maxDepth) {
    if (currentDepth > maxDepth) {
        maxDepth = currentDepth;
    }

    if (isDecisionPoint(node, sourceCode)) {
        complexity++;
    }

    bool createsScope = isNestingControlStructure(node);
    size_t nextDepth = createsScope ? currentDepth + 1 : currentDepth;

    uint32_t count = ts_node_child_count(node);
    for (uint32_t i = 0; i < count; ++i) {
        TSNode child = ts_node_child(node, i);
        std::string childType = ts_node_type(child);

        // Do not recurse into nested function definitions (they will be analyzed independently)
        if (childType == "function_definition" ||
            childType == "function_declaration" ||
            childType == "arrow_function" ||
            childType == "function_expression" ||
            childType == "method_definition") {
            continue;
        }

        computeComplexityAndNesting(child, sourceCode, nextDepth, complexity, maxDepth);
    }
}

FunctionMetrics AstParser::processFunctionNode(TSNode node, const std::string& sourceCode, const std::string& language) {
    FunctionMetrics metrics;
    metrics.name = extractFunctionName(node, sourceCode, language);

    TSPoint startPt = ts_node_start_point(node);
    TSPoint endPt = ts_node_end_point(node);

    // Tree-sitter rows are 0-indexed; convert to 1-indexed for human readability
    metrics.startLine = startPt.row + 1;
    metrics.endLine = endPt.row + 1;
    metrics.startColumn = startPt.column + 1;
    metrics.endColumn = endPt.column + 1;
    metrics.lineCount = (metrics.endLine >= metrics.startLine) ? (metrics.endLine - metrics.startLine + 1) : 1;
    metrics.parameterCount = countParameters(node);

    // McCabe baseline cyclomatic complexity is 1 (representing the default single entry-to-exit path)
    size_t complexity = 1;
    size_t maxDepth = 0;

    // Analyze body of the function
    TSNode bodyNode = ts_node_child_by_field_name(node, "body", 4);
    if (!ts_node_is_null(bodyNode)) {
        computeComplexityAndNesting(bodyNode, sourceCode, 0, complexity, maxDepth);
    } else {
        // Scan children for compound_statement or statement_block
        uint32_t childCount = ts_node_child_count(node);
        for (uint32_t i = 0; i < childCount; ++i) {
            TSNode c = ts_node_child(node, i);
            std::string cType = ts_node_type(c);
            if (cType == "compound_statement" || cType == "statement_block") {
                computeComplexityAndNesting(c, sourceCode, 0, complexity, maxDepth);
                break;
            }
        }
    }

    metrics.cyclomaticComplexity = complexity;
    metrics.maxNestingDepth = maxDepth;
    metrics.isHighComplexity = (complexity > 10);

    return metrics;
}

void AstParser::traverseNode(TSNode node, const std::string& sourceCode, const std::string& language, FileComplexitySummary& summary) {
    std::string type = ts_node_type(node);

    bool isFunction = false;
    if (language == "cpp" || language == "c") {
        if (type == "function_definition") {
            isFunction = true;
        }
    } else {
        if (type == "function_declaration" ||
            type == "method_definition" ||
            type == "arrow_function" ||
            type == "function_expression") {
            isFunction = true;
        }
    }

    if (isFunction) {
        FunctionMetrics funcMetrics = processFunctionNode(node, sourceCode, language);
        summary.functions.push_back(funcMetrics);
        summary.totalFunctions++;

        if (funcMetrics.cyclomaticComplexity > summary.maxComplexity) {
            summary.maxComplexity = funcMetrics.cyclomaticComplexity;
        }
        if (funcMetrics.maxNestingDepth > summary.maxNestingDepth) {
            summary.maxNestingDepth = funcMetrics.maxNestingDepth;
        }
        if (funcMetrics.isHighComplexity) {
            summary.complexFunctionCount++;
        }
    }

    // Traverse children
    uint32_t count = ts_node_child_count(node);
    for (uint32_t i = 0; i < count; ++i) {
        TSNode child = ts_node_child(node, i);
        traverseNode(child, sourceCode, language, summary);
    }
}

FileComplexitySummary AstParser::analyzeSource(const std::string& sourceCode, const std::string& language) {
    FileComplexitySummary summary;
    if (sourceCode.empty()) return summary;

    TSParser* parser = (language == "javascript" || language == "typescript") ? jsParser_ : cParser_;
    if (!parser) return summary;

    TSTree* tree = ts_parser_parse_string(parser, nullptr, sourceCode.c_str(), static_cast<uint32_t>(sourceCode.length()));
    if (!tree) return summary;

    TSNode root = ts_tree_root_node(tree);
    traverseNode(root, sourceCode, language, summary);

    if (summary.totalFunctions > 0) {
        double totalComp = 0.0;
        for (const auto& fn : summary.functions) {
            totalComp += static_cast<double>(fn.cyclomaticComplexity);
        }
        summary.averageComplexity = totalComp / static_cast<double>(summary.totalFunctions);
    }

    ts_tree_delete(tree);
    return summary;
}

} // namespace codeinsight
