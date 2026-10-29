# CodeInsight Metrics Specification & Calculation Methodology

This document outlines the formal calculation methodologies, algorithms, and theoretical foundations for code health and technical debt metrics in **CodeInsight**.

---

## 1. Cyclomatic Complexity ($M$)

### Theoretical Foundation
Originally formulated by **Thomas J. McCabe (1976)**, Cyclomatic Complexity measures the number of linearly independent paths through a program's source code module. 

In graph-theoretic terms, for a control-flow graph $G$ with $E$ edges, $N$ nodes, and $P$ connected components:
$$M = E - N + 2P$$

For a single function or subroutine ($P = 1$):
$$M = 1 + D$$
where $D$ is the count of distinct predicate (decision) points in the Abstract Syntax Tree (AST).

### AST Node Mappings

| Language | AST Node Types Counted as Decision Points ($+1$) |
| :--- | :--- |
| **C / C++** | `if_statement`, `conditional_expression` (`? :`), `for_statement`, `while_statement`, `do_statement`, `case_statement` (excluding `default`), `binary_expression` where operator is `&&` or `\|\|`, `catch_clause` |
| **JavaScript / TypeScript** | `IfStatement`, `ConditionalExpression` (`? :`), `ForStatement`, `ForInStatement`, `ForOfStatement`, `WhileStatement`, `DoWhileStatement`, `SwitchCase` (when `test !== null`), `LogicalExpression` (`&&`, `\|\|`, `??`), `CatchClause` |

### Academic Ground Rules
1. **Baseline**: Every function has an intrinsic minimum complexity of **$1$**, corresponding to the sequential execution flow without branches.
2. **Boolean Short-Circuit Operators**: Each occurrence of `&&`, `||`, and `??` is counted as a separate decision point because short-circuit evaluation creates an alternative execution path.
3. **Switch Statements**: Each `case` label represents a branch. The `default` label is the fallthrough/unconditional baseline and is **not** counted as an additional decision point.

### Severity Thresholds
- **$1 - 10$**: Low Risk (Simple, well-structured procedure; high testability)
- **$11 - 20$**: Moderate Risk (Moderate complexity; requires targeted unit tests)
- **$21 - 50$**: High Risk (High complexity; difficult to test, error-prone)
- **$> 50$**: Critical (Untestable legacy hotspot; candidate for decomposition)

---

## 2. Maximum Nesting Depth

### Definition
Maximum Nesting Depth measures the maximum level of control-flow block nesting within a function body. Deep nesting dramatically impairs human cognitive comprehension and correlates strongly with defect density.

### Calculation Algorithm
1. The function root body starts at `depth = 0`.
2. Whenever traversal descends into a compound block enclosed by a control structure (`if`, `for`, `while`, `do`, `switch`, `try`/`catch`), `currentDepth` increments by $1$.
3. Exiting a block decrements `currentDepth` by $1$.
4. $\text{MaxNestingDepth} = \max(\text{currentDepth})$ observed across the entire function traversal.

### Guidelines
- **$0 - 2$**: Clean structure
- **$3$**: Acceptable
- **$\ge 4$**: Code smell (Arrow anti-pattern; recommend guard clauses or method extraction)

---

## 3. Function Length & Parameters

- **Function Length (LOC)**: Computed as `endLine - startLine + 1` from the enclosing AST function node.
- **Parameter Count**: Total count of formal parameters declared in the function signature. Functions with $> 4$ parameters are flagged for possible parameter object refactoring.

---

## 4. File-Level Aggregation

For any analyzed file $F$ containing $K$ functions:
$$\text{AverageComplexity}(F) = \begin{cases} \frac{1}{K} \sum_{i=1}^K M_i, & \text{if } K > 0 \\ 0, & \text{if } K = 0 \end{cases}$$
$$\text{MaxComplexity}(F) = \max_{1 \le i \le K} M_i$$
$$\text{ComplexFunctionCount}(F) = \sum_{i=1}^K [M_i > 10]$$

---

## 5. Duplicate Code Detection Methodology

### Theoretical Foundation
Code clones are categorized into 4 classical types:
1. **Type 1 (Exact)**: Identical code fragments except for formatting, whitespace, and comments.
2. **Type 2 (Parameterized)**: Syntactically identical fragments where identifiers and literals have been renamed.
3. **Type 3 (Near-Miss)**: Fragments with statements added, deleted, or reordered.
4. **Type 4 (Semantic)**: Computationally identical logic with disparate syntax.

CodeInsight implements an exact, normalized token-based **Type 1** clone detection engine with maximal clone expansion.

### Detection Pipeline
1. **Normalization**: Comments (`//`, `/* ... */`) and empty lines are stripped. Internal whitespace sequences `[ \t]+` are collapsed to single spaces. Original 1-indexed line numbers are tracked.
2. **Sliding Window Hashing**: A sliding window of size $K = \text{minBlockLines}$ (default 5 lines) slides across normalized files. Blocks under $\text{minTokenChars} = 30$ characters are discarded to prevent trivial boilerplate repetition (e.g., repeating closing braces).
3. **Maximal Clone Expansion**: Matching blocks are extended forward until the next non-matching line is reached, generating the maximal duplicate range.
4. **Subsumption Filtering**: Sub-slices covered by larger duplicate blocks are filtered out to eliminate redundant duplicate reports.
5. **Clustering & Percentage**: Clones are grouped into `DuplicateGroup` entities with unique IDs (`DUP-001`, `DUP-002`).

### Duplication Percentage Formula
For a file $F$ containing $N$ total lines, where $D(F)$ is the set of unique line indices involved in any clone fragment:
$$\text{DuplicationPercentage}(F) = \frac{|D(F)|}{N} \times 100\%$$

Across the whole repository:
$$\text{OverallDuplication} = \frac{\sum_{F \in \text{Repo}} |D(F)|}{\sum_{F \in \text{Repo}} \text{TotalLines}(F)} \times 100\%$$




