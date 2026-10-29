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

---

## 6. Technical Debt Risk Scoring (Phase 7)

### 6.1 Multi-Dimensional Heuristic Model
Technical debt cannot be characterized by a single univariate metric. CodeInsight computes an explainable, multi-dimensional **Technical Debt Risk Score** ($R \in [0, 100]$) combining structural, algorithmic, and duplication indicators.

The default provisional weights are:
- **$W_{\text{complexity}} = 30\%$**: Cyclomatic complexity & control-flow nesting depth
- **$W_{\text{duplication}} = 25\%$**: Normalized duplicate code percentage
- **$W_{\text{dependency}} = 20\%$**: Dependency coupling & cyclic risk (extensible when Phase 5 is active)
- **$W_{\text{churn}} = 15\%$**: Historical Git modification frequency & churn (extensible when Phase 6 is active)
- **$W_{\text{structural}} = 10\%$**: Physical file size (LOC) and max line length

### 6.2 Dynamic Active Weight Re-Normalization
When certain metric dimensions are omitted (such as when Phase 5 dependency analysis or Phase 6 Git history analysis are skipped or deactivated), the engine dynamically **re-normalizes active weights** so their sum remains exactly $1.0$ ($100\%$):

$$W'_i = \frac{W_i}{\sum_{k \in \text{Active}} W_k}$$

For example, when dependency and churn metrics are omitted:
$$\sum_{k \in \text{Active}} W_k = 0.30 + 0.25 + 0.10 = 0.65$$
$$W'_{\text{complexity}} = \frac{0.30}{0.65} \approx 46.15\%$$
$$W'_{\text{duplication}} = \frac{0.25}{0.65} \approx 38.46\%$$
$$W'_{\text{structural}} = \frac{0.10}{0.65} \approx 15.38\%$$

### 6.3 Metric Normalization Functions (0–100 Scale)

#### 1. Complexity Dimension ($S_{\text{complexity}} \in [0, 100]$)
Blends maximum cyclomatic complexity ($M_{\max}$) with maximum nesting depth ($N_{\max}$):

$$\text{NormMaxComplexity}(M) = \begin{cases} 
0, & M \le 1 \\
\frac{M}{10} \times 30, & 1 < M \le 10 \\
30 + \frac{M - 10}{15} \times 40, & 10 < M \le 25 \\
70 + \frac{M - 25}{25} \times 20, & 25 < M \le 50 \\
\min\left(100, 90 + \frac{M - 50}{50} \times 10\right), & M > 50 
\end{cases}$$

$$\text{NormNestingDepth}(N) = \begin{cases}
0, & N \le 1 \\
\frac{N - 1}{2} \times 40, & 1 < N \le 3 \\
40 + \frac{N - 3}{2} \times 40, & 3 < N \le 5 \\
\min\left(100, 80 + (N - 5) \times 10\right), & N > 5
\end{cases}$$

If the file contains functions ($K > 0$):
$$S_{\text{complexity}} = \min\left(100, \; 0.65 \times \text{NormMaxComplexity}(M_{\max}) + 0.35 \times \text{NormNestingDepth}(N_{\max}) + \text{Bonus}(C_{\text{high}})\right)$$
where $\text{Bonus}(C_{\text{high}}) = \min(15, (C_{\text{high}} - 1) \times 3)$ when multiple functions exceed McCabe complexity 10.

#### 2. Duplication Dimension ($S_{\text{duplication}} \in [0, 100]$)
Non-linear saturation curve mapping clone percentage $P \in [0, 100]$:
$$S_{\text{duplication}} = \begin{cases}
0, & P = 0 \\
\frac{P}{10} \times 20, & 0 < P \le 10 \\
20 + \frac{P - 10}{20} \times 35, & 10 < P \le 30 \\
55 + \frac{P - 30}{30} \times 30, & 30 < P \le 60 \\
\min\left(100, 85 + \frac{P - 60}{40} \times 15\right), & P > 60
\end{cases}$$

#### 3. Structural Dimension ($S_{\text{structural}} \in [0, 100]$)
Measures physical monolithic size (Lines of Code) and formatting density (excessive line length):
$$S_{\text{LOC}} = \begin{cases}
\frac{\text{LOC}}{100} \times 15, & \text{LOC} \le 100 \\
15 + \frac{\text{LOC} - 100}{200} \times 20, & 100 < \text{LOC} \le 300 \\
35 + \frac{\text{LOC} - 300}{450} \times 35, & 300 < \text{LOC} \le 750 \\
70 + \frac{\text{LOC} - 750}{750} \times 20, & 750 < \text{LOC} \le 1500 \\
\min\left(100, 90 + \frac{\text{LOC} - 1500}{1500} \times 10\right), & \text{LOC} > 1500
\end{cases}$$
$$S_{\text{structural}} = \min\left(100, \; 0.9 \times S_{\text{LOC}} + \min\left(10, \frac{\max(\text{LineLen}) - 150}{150} \times 10\right)\right)$$

### 6.4 Severity Categorization
- **$0 - 24$**: **Low Risk** (Well-structured, maintainable code)
- **$25 - 49$**: **Moderate Risk** (Moderate complexity; monitor during sprints)
- **$50 - 74$**: **High Risk** (Noticeable architectural debt; prioritize for refactoring)
- **$75 - 100$**: **Critical Risk** (Severe technical debt hotspot; refactor immediately)

### 6.5 Remediation Priority Heuristic
To assist engineering leads in triage, CodeInsight calculates an explainable **Remediation Priority Score**:

$$\text{PriorityScore} = \min\left(100, \; \frac{\text{RiskScore} \times \text{ImpactMultiplier}}{\text{EffortFactor}}\right)$$

- **$\text{ImpactMultiplier} \in [1.0, 1.5]$**: Elevated when a file houses critical functions with many dependents or multiple high-complexity procedures ($C_{\text{high}} > 0$).
- **$\text{EffortFactor} \in [1.0, 2.5]$**: Estimated refactoring friction based on monolithic size ($\text{LOC} > 300$) and complex function volume.
- **Tiers**:
  - **P1 (Urgent)**: $\text{RiskScore} \ge 75$ or $\text{PriorityScore} \ge 70$
  - **P2 (High)**: $\text{RiskScore} \ge 50$ or $\text{PriorityScore} \ge 45$
  - **P3 (Medium)**: $\text{RiskScore} \ge 25$ or $\text{PriorityScore} \ge 25$
  - **P4 (Low)**: Maintain as-is

> **Academic Disclaimer**: Technical debt scores and remediation priority levels are static analysis heuristics, not empirical guarantees of runtime defects or software failure. They serve as transparent triage guides to focus code review and refactoring efforts.





