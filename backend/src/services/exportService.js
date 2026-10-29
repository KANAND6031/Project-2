/**
 * CodeInsight Export Service
 * Phase 8: Multi-Format Report Exporter (JSON, Markdown, CSV)
 */

class ExportService {
  /**
   * Generates a complete JSON export.
   */
  exportJson(scan) {
    return JSON.stringify(
      {
        exportTimestamp: new Date().toISOString(),
        scanId: scan.id,
        repoPath: scan.repoPath,
        status: scan.status,
        durationMs: scan.durationMs,
        data: scan.report
      },
      null,
      2
    );
  }

  /**
   * Generates an executive Markdown report.
   */
  exportMarkdown(scan) {
    const report = scan.report || {};
    const sum = report.summary || {};
    const debt = report.technicalDebt || {};
    const hotspots = debt.topHotspots || [];
    const recommendations = debt.recommendations || [];

    const lines = [];
    lines.push(`# CodeInsight Codebase Health & Technical Debt Report`);
    lines.push(`\n**Scan ID**: \`${scan.id}\``);
    lines.push(`**Repository**: \`${scan.repoPath}\``);
    lines.push(`**Scan Timestamp**: ${scan.completedAt || scan.createdAt}`);
    lines.push(`**Duration**: ${scan.durationMs}ms`);
    lines.push(`**Engine Version**: ${report.engineVersion || '1.2.0'}`);
    lines.push(`\n---\n`);

    lines.push(`## 1. Executive Summary`);
    lines.push(`\n- **Overall Repository Risk Score**: **${debt.repositoryRiskScore || 0} / 100**`);
    lines.push(`- **Overall Health Severity**: **${debt.overallSeverity || 'LOW'}**`);
    lines.push(`- **Risk Formula**: \`${debt.formula || 'R = 0.45*C + 0.35*D + 0.20*S'}\``);
    lines.push(`- **Total Files Analyzed**: ${sum.totalFiles || 0}`);
    lines.push(`- **Total Lines of Code**: ${sum.totalCodeLines || sum.totalLines || 0}`);
    lines.push(`- **Total Functions Extracted**: ${sum.totalFunctions || 0}`);
    lines.push(`- **Average Cyclomatic Complexity**: ${sum.averageComplexity || 0}`);
    lines.push(`- **Overall Code Duplication**: ${sum.overallDuplicationPercentage || 0}%`);
    lines.push(`\n### Risk Distribution`);
    lines.push(`- **Low Risk (0–24)**: ${debt.riskDistribution?.LOW || 0}`);
    lines.push(`- **Moderate Risk (25–49)**: ${debt.riskDistribution?.MODERATE || 0}`);
    lines.push(`- **High Risk (50–74)**: ${debt.riskDistribution?.HIGH || 0}`);
    lines.push(`- **Critical Risk (75–100)**: ${debt.riskDistribution?.CRITICAL || 0}`);
    lines.push(`\n---\n`);

    lines.push(`## 2. Top Technical Debt Hotspots`);
    if (hotspots.length === 0) {
      lines.push(`\n*No high or critical technical debt hotspots detected.*`);
    } else {
      lines.push(`\n| File Path | Risk Score | Severity | Priority | Primary Driver | Key Factor |`);
      lines.push(`| :--- | :---: | :---: | :---: | :--- | :--- |`);
      hotspots.forEach(h => {
        lines.push(
          `| \`${h.relativePath}\` | **${h.riskScore}** | \`${h.severity}\` | \`${h.remediationPriority}\` | ${h.primaryDriver} | ${h.topFactor} |`
        );
      });
    }
    lines.push(`\n---\n`);

    lines.push(`## 3. Actionable Recommendations`);
    if (recommendations.length === 0) {
      lines.push(`\n*No urgent refactoring actions required.*`);
    } else {
      recommendations.forEach((rec, idx) => {
        lines.push(`\n### ${idx + 1}. [${rec.severity}] ${rec.title}`);
        lines.push(`${rec.description}`);
      });
    }
    lines.push(`\n---\n`);

    lines.push(`## 4. Methodology & Theoretical Foundation`);
    lines.push(`\nThis audit uses deterministic Abstract Syntax Tree (AST) analysis and sliding-window clone hashing.`);
    lines.push(`Results represent static analysis risk heuristics, not empirical predictions of software failure.`);

    return lines.join('\n');
  }

  /**
   * Generates a CSV export of analyzed files.
   */
  exportCsv(scan) {
    const files = scan.report?.files || [];

    const headers = [
      'Relative Path',
      'Language',
      'Total Lines',
      'Code Lines',
      'Max Complexity',
      'Avg Complexity',
      'Duplication %',
      'Length Score (L)',
      'Nesting Score (N)',
      'Parameter Score (P)',
      'Structural Score (S)',
      'Complexity Score (C)',
      'Duplication Score (D)',
      'Overall Risk Score (R)',
      'Severity',
      'Remediation Priority'
    ];

    const escapeCsv = val => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = [headers.join(',')];

    files.forEach(f => {
      const comp = f.complexitySummary || {};
      const breakdown = f.riskBreakdown || {};
      const sub = breakdown.subScores || {};
      const struct = breakdown.structuralDetails || {};

      const row = [
        escapeCsv(f.relativePath),
        escapeCsv(f.language),
        f.totalLines,
        f.codeLines,
        comp.maxComplexity || 0,
        comp.averageComplexity || 0,
        f.duplicatePercentage || 0,
        struct.lengthScore || 0,
        struct.nestingScore || 0,
        struct.parameterScore || 0,
        sub.structural || 0,
        sub.complexity || 0,
        sub.duplication || 0,
        f.riskScore || 0,
        escapeCsv(f.severity),
        escapeCsv(f.remediationPriority?.priority || 'P4')
      ];

      rows.push(row.join(','));
    });

    return rows.join('\r\n');
  }
}

module.exports = new ExportService();

