const babelParser = require('@babel/parser');
const fs = require('fs');
const path = require('path');

class AstEngine {
  /**
   * Analyzes an individual source file and returns function metrics and complexity summaries.
   * @param {string} filePath - Absolute path to file
   * @param {string} content - Source code string
   * @param {string} language - 'cpp' or 'javascript' / 'typescript'
   * @returns {object} FileComplexitySummary
   */
  analyzeFile(filePath, content, language) {
    if (language === 'javascript' || language === 'typescript') {
      return this.analyzeJavaScript(content);
    } else if (language === 'cpp' || language === 'c') {
      return this.analyzeCpp(content);
    }

    return {
      totalFunctions: 0,
      averageComplexity: 0,
      maxComplexity: 0,
      maxNestingDepth: 0,
      complexFunctionCount: 0,
      functions: []
    };
  }

  /**
   * Analyzes JavaScript source code using Babel AST.
   */
  analyzeJavaScript(sourceCode) {
    const summary = {
      totalFunctions: 0,
      averageComplexity: 0,
      maxComplexity: 0,
      maxNestingDepth: 0,
      complexFunctionCount: 0,
      functions: []
    };

    let ast;
    try {
      ast = babelParser.parse(sourceCode, {
        sourceType: 'unambiguous',
        plugins: ['jsx', 'typescript', 'classProperties', 'dynamicImport', 'nullishCoalescingOperator', 'optionalChaining'],
        errorRecovery: true
      });
    } catch (err) {
      // In case of syntax error in incomplete code
      return summary;
    }

    const functions = [];

    const traverse = (node, parent) => {
      if (!node || typeof node !== 'object') return;

      const isFunc =
        node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'ClassMethod' ||
        node.type === 'ObjectMethod';

      if (isFunc) {
        let name = 'anonymous';
        if (node.id && node.id.name) {
          name = node.id.name;
        } else if (node.key && node.key.name) {
          name = node.key.name;
        } else if (parent && parent.type === 'VariableDeclarator' && parent.id && parent.id.name) {
          name = parent.id.name;
        } else if (node.loc) {
          name = `anonymous@${node.loc.start.line}:${node.loc.start.column + 1}`;
        }

        const startLine = node.loc ? node.loc.start.line : 1;
        const endLine = node.loc ? node.loc.end.line : startLine;
        const startColumn = node.loc ? node.loc.start.column + 1 : 1;
        const endColumn = node.loc ? node.loc.end.column + 1 : 1;
        const lineCount = Math.max(1, endLine - startLine + 1);
        const parameterCount = Array.isArray(node.params) ? node.params.length : 0;

        // Compute McCabe cyclomatic complexity: baseline 1 + decision points
        let complexity = 1;
        let maxDepth = 0;

        const countDecisions = (childNode, currentDepth) => {
          if (!childNode || typeof childNode !== 'object') return;

          // Don't recurse into nested function bodies (they are evaluated independently)
          if (childNode !== node && (
            childNode.type === 'FunctionDeclaration' ||
            childNode.type === 'FunctionExpression' ||
            childNode.type === 'ArrowFunctionExpression' ||
            childNode.type === 'ClassMethod' ||
            childNode.type === 'ObjectMethod'
          )) {
            return;
          }

          if (currentDepth > maxDepth) {
            maxDepth = currentDepth;
          }

          let createsScope = false;

          switch (childNode.type) {
            case 'IfStatement':
            case 'ForStatement':
            case 'ForInStatement':
            case 'ForOfStatement':
            case 'WhileStatement':
            case 'DoWhileStatement':
              complexity++;
              createsScope = true;
              break;
            case 'ConditionalExpression': // a ? b : c
              complexity++;
              break;
            case 'SwitchCase':
              if (childNode.test !== null) { // Exclude 'default' case
                complexity++;
              }
              createsScope = true;
              break;
            case 'LogicalExpression': // &&, ||, ??
              complexity++;
              break;
            case 'CatchClause':
              complexity++;
              createsScope = true;
              break;
            case 'BlockStatement':
              // Inner compound block
              break;
          }

          const nextDepth = createsScope ? currentDepth + 1 : currentDepth;

          for (const key of Object.keys(childNode)) {
            if (key === 'parent' || key === 'loc') continue;
            const val = childNode[key];
            if (Array.isArray(val)) {
              for (const item of val) countDecisions(item, nextDepth);
            } else if (val && typeof val === 'object') {
              countDecisions(val, nextDepth);
            }
          }
        };

        if (node.body) {
          countDecisions(node.body, 0);
        }

        const funcMetric = {
          name,
          startLine,
          endLine,
          startColumn,
          endColumn,
          lineCount,
          parameterCount,
          cyclomaticComplexity: complexity,
          maxNestingDepth: maxDepth,
          isHighComplexity: complexity > 10
        };

        functions.push(funcMetric);
      }

      for (const key of Object.keys(node)) {
        if (key === 'parent' || key === 'loc') continue;
        const val = node[key];
        if (Array.isArray(val)) {
          for (const item of val) traverse(item, node);
        } else if (val && typeof val === 'object') {
          traverse(val, node);
        }
      }
    };

    traverse(ast.program, null);

    summary.totalFunctions = functions.length;
    summary.functions = functions;

    if (functions.length > 0) {
      let totalComp = 0;
      for (const fn of functions) {
        totalComp += fn.cyclomaticComplexity;
        if (fn.cyclomaticComplexity > summary.maxComplexity) {
          summary.maxComplexity = fn.cyclomaticComplexity;
        }
        if (fn.maxNestingDepth > summary.maxNestingDepth) {
          summary.maxNestingDepth = fn.maxNestingDepth;
        }
        if (fn.isHighComplexity) {
          summary.complexFunctionCount++;
        }
      }
      summary.averageComplexity = parseFloat((totalComp / functions.length).toFixed(2));
    }

    return summary;
  }

  /**
   * Analyzes C/C++ source code to extract functions, lines, parameters, and cyclomatic complexity.
   */
  analyzeCpp(sourceCode) {
    const summary = {
      totalFunctions: 0,
      averageComplexity: 0,
      maxComplexity: 0,
      maxNestingDepth: 0,
      complexFunctionCount: 0,
      functions: []
    };

    const lines = sourceCode.split(/\r?\n/);
    const functions = [];

    // Strip comments to avoid false-positive keyword triggers
    let inBlockComment = false;
    const cleanLines = lines.map(line => {
      let clean = '';
      for (let i = 0; i < line.length; ++i) {
        if (inBlockComment) {
          if (line[i] === '*' && line[i + 1] === '/') {
            inBlockComment = false;
            i++;
          }
          continue;
        }
        if (line[i] === '/' && line[i + 1] === '*') {
          inBlockComment = true;
          i++;
          continue;
        }
        if (line[i] === '/' && line[i + 1] === '/') {
          break; // Line comment consumes rest of line
        }
        clean += line[i];
      }
      return clean;
    });

    // Match C/C++ function signature: [type] [name]([params]) {
    // Avoid control flow statements (if, while, for, switch, catch)
    const funcRegex = /(?:(?:inline|static|virtual|explicit|constexpr|extern|friend)\s+)*(?:[\w:<>&*]+\s+)+([a-zA-Z_]\w*(?:::~?[a-zA-Z_]\w*)*)\s*\(([^)]*)\)\s*(?:const|override|noexcept)?\s*\{/g;

    const fullClean = cleanLines.join('\n');
    let match;

    while ((match = funcRegex.exec(fullClean)) !== null) {
      const funcName = match[1];
      if (['if', 'for', 'while', 'switch', 'catch'].includes(funcName)) {
        continue;
      }

      const matchIndex = match.index;
      const startLine = fullClean.substring(0, matchIndex).split('\n').length;
      const rawParams = match[2].trim();
      let parameterCount = 0;
      if (rawParams && rawParams !== 'void') {
        parameterCount = rawParams.split(',').filter(p => p.trim().length > 0).length;
      }

      // Find matching closing brace '}' for the function body
      const openBraceIndex = fullClean.indexOf('{', matchIndex);
      let braceCount = 1;
      let bodyEndIndex = -1;
      let inString = false;
      let strChar = '';

      for (let i = openBraceIndex + 1; i < fullClean.length; ++i) {
        const c = fullClean[i];
        if (inString) {
          if (c === '\\') {
            i++;
          } else if (c === strChar) {
            inString = false;
          }
          continue;
        }
        if (c === '"' || c === '\'') {
          inString = true;
          strChar = c;
          continue;
        }
        if (c === '{') {
          braceCount++;
        } else if (c === '}') {
          braceCount--;
          if (braceCount === 0) {
            bodyEndIndex = i;
            break;
          }
        }
      }

      if (bodyEndIndex === -1) {
        bodyEndIndex = fullClean.length - 1;
      }

      const endLine = fullClean.substring(0, bodyEndIndex).split('\n').length;
      const lineCount = Math.max(1, endLine - startLine + 1);

      // Analyze body for cyclomatic complexity and nesting depth
      const bodyText = fullClean.substring(openBraceIndex + 1, bodyEndIndex);
      let complexity = 1; // Baseline M = 1
      let maxDepth = 0;
      let currentDepth = 0;

      // Tokenize body to detect decision points and nesting
      const tokens = bodyText.match(/\b(if|for|while|do|case|switch|catch)\b|&&|\|\||\?|[{}]/g) || [];

      for (const token of tokens) {
        if (token === '{') {
          currentDepth++;
          if (currentDepth > maxDepth) maxDepth = currentDepth;
        } else if (token === '}') {
          if (currentDepth > 0) currentDepth--;
        } else if (['if', 'for', 'while', 'case', 'catch', '&&', '||', '?'].includes(token)) {
          complexity++;
        }
      }

      functions.push({
        name: funcName,
        startLine,
        endLine,
        startColumn: 1,
        endColumn: 1,
        lineCount,
        parameterCount,
        cyclomaticComplexity: complexity,
        maxNestingDepth: maxDepth,
        isHighComplexity: complexity > 10
      });
    }

    summary.totalFunctions = functions.length;
    summary.functions = functions;

    if (functions.length > 0) {
      let totalComp = 0;
      for (const fn of functions) {
        totalComp += fn.cyclomaticComplexity;
        if (fn.cyclomaticComplexity > summary.maxComplexity) {
          summary.maxComplexity = fn.cyclomaticComplexity;
        }
        if (fn.maxNestingDepth > summary.maxNestingDepth) {
          summary.maxNestingDepth = fn.maxNestingDepth;
        }
        if (fn.isHighComplexity) {
          summary.complexFunctionCount++;
        }
      }
      summary.averageComplexity = parseFloat((totalComp / functions.length).toFixed(2));
    }

    return summary;
  }
}

module.exports = new AstEngine();

