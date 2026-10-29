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

### 6.1 Unified Risk Formula
To provide an actionable, transparent assessment of technical debt risk, CodeInsight computes an overall **File Technical Debt Risk Score** ($R \in [0, 100]$):

$$\boxed{R = 0.45C + 0.35D + 0.20S}$$

Where:
- **$R$**: Overall file risk score ($0–100$)
- **$C$**: Normalized complexity score ($0–100$, 45% weight)
- **$D$**: Normalized duplication score ($0–100$, 35% weight)
- **$S$**: Normalized size and structural risk score ($0–100$, 20% weight)

---

### 6.2 Component Metric Calculations

#### A. Complexity Score ($C$ — 45%)
Measures the maximum function cyclomatic complexity ($M = 1 + \text{decision points}$) within the file:

| Maximum Function Complexity ($M$) | Complexity Score ($C$) | Description |
| :--- | :---: | :--- |
| **0** (No functions) | **0** | Data / configuration / declaration-only file |
| **1 – 5** | **10** | Simple, straightforward control flow |
| **6 – 10** | **35** | Moderate complexity |
| **11 – 15** | **65** | High complexity; challenging to test |
| **Above 15** | **90** | Very high / unmaintainable complexity |

#### B. Duplication Score ($D$ — 35%)
Evaluates the percentage of file lines identified as duplicated blocks:
$$\text{Duplication \%} = \frac{\text{Duplicated Lines}}{\text{Total Lines of Code}} \times 100$$

| Duplication Percentage ($P$) | Duplication Score ($D$) | Description |
| :--- | :---: | :--- |
| **0%** | **0** | Clean, unique code |
| **1 – 5%** | **20** | Incidental / minimal duplication |
| **6 – 10%** | **40** | Noticeable repeated logic |
| **11 – 20%** | **70** | Substantial copy-pasted blocks |
| **Above 20%** | **90** | Severe code cloning |

#### C. Size and Structural Score ($S$ — 20%)
Combines physical file length, nesting depth, and formal parameter count:

$$\boxed{S = 0.40L + 0.35N + 0.25P}$$

Where:
- **$L$ (Function / File Length Score — 40%)**:
  - File lines $\le 100$ and max function lines $\le 30 \implies L = 10$
  - File lines $101 - 300$ or max function lines $31 - 60 \implies L = 35$
  - File lines $301 - 700$ or max function lines $61 - 120 \implies L = 65$
  - File lines $> 700$ or max function lines $> 120 \implies L = 90$
  - *(Empty file with 0 lines $\implies L = 0$)*
- **$N$ (Nesting-Depth Score — 35%)**:
  - Max nesting depth $\le 1 \implies N = 10$ *(or $0$ if 0 functions)*
  - Max nesting depth $= 2 \implies N = 35$
  - Max nesting depth $= 3 \implies N = 65$
  - Max nesting depth $\ge 4 \implies N = 90$
- **$P$ (Parameter-Count Score — 25%)**:
  - Max function parameters $\le 2 \implies P = 10$ *(or $0$ if 0 functions)*
  - Max function parameters $3 - 4 \implies P = 35$
  - Max function parameters $5 - 6 \implies P = 65$
  - Max function parameters $> 6 \implies P = 90$

---

### 6.3 Severity Categorization
- **$0 - 24$**: **Low Risk** (Well-structured, maintainable code)
- **$25 - 49$**: **Moderate Risk** (Moderate complexity; monitor during standard sprint cycles)
- **$50 - 74$**: **High Risk** (Significant technical debt; plan dedicated refactoring)
- **$75 - 100$**: **Critical Risk** (Severe technical debt hotspot; priority candidate for decomposition)

---

### 6.4 Remediation Priority Heuristic ($P1 - P4$)
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





