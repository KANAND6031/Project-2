/**
 * CodeInsight PostgreSQL Scan Repository
 * Phase 9: Relational Persistence with Transactions & Parameterized Queries
 */

const db = require('./db');
const crypto = require('crypto');
const path = require('path');

class ScanRepository {
  /**
   * Saves or updates a repository in PostgreSQL.
   */
  async saveRepository(repo) {
    const text = `
      INSERT INTO repositories (id, name, path, git_url, description, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (path) DO UPDATE
      SET name = EXCLUDED.name,
          git_url = EXCLUDED.git_url,
          description = EXCLUDED.description,
          updated_at = NOW()
      RETURNING *;
    `;
    const values = [
      repo.id || `repo_${crypto.randomBytes(6).toString('hex')}`,
      repo.name,
      repo.path,
      repo.gitUrl || null,
      repo.description || null
    ];

    const res = await db.query(text, values);
    return res.rows[0];
  }

  /**
   * Retrieves all repositories with aggregate statistics.
   */
  async listRepositories() {
    const text = `
      SELECT r.*,
             COUNT(s.id)::int AS scan_count,
             MAX(s.created_at) AS last_scanned_at,
             (
               SELECT s2.id FROM scans s2
               WHERE s2.repository_id = r.id AND s2.status = 'completed'
               ORDER BY s2.created_at DESC LIMIT 1
             ) AS last_scan_id,
             (
               SELECT sm.repository_risk_score FROM scans s3
               JOIN scan_summaries sm ON sm.scan_id = s3.id
               WHERE s3.repository_id = r.id AND s3.status = 'completed'
               ORDER BY s3.created_at DESC LIMIT 1
             ) AS latest_risk_score,
             (
               SELECT sm.overall_severity FROM scans s4
               JOIN scan_summaries sm ON sm.scan_id = s4.id
               WHERE s4.repository_id = r.id AND s4.status = 'completed'
               ORDER BY s4.created_at DESC LIMIT 1
             ) AS latest_severity
      FROM repositories r
      LEFT JOIN scans s ON s.repository_id = r.id
      GROUP BY r.id
      ORDER BY r.created_at DESC;
    `;
    const res = await db.query(text);
    return res.rows.map(r => ({
      id: r.id,
      name: r.name,
      path: r.path,
      gitUrl: r.git_url,
      description: r.description,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      scanCount: r.scan_count || 0,
      lastScanId: r.last_scan_id || null,
      lastScannedAt: r.last_scanned_at || null,
      latestRiskScore: r.latest_risk_score ? Number(r.latest_risk_score) : null,
      latestSeverity: r.latest_severity || null
    }));
  }

  /**
   * Retrieves an individual repository by ID.
   */
  async getRepositoryById(id) {
    const text = `SELECT * FROM repositories WHERE id = $1`;
    const res = await db.query(text, [id]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      name: r.name,
      path: r.path,
      gitUrl: r.git_url,
      description: r.description,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  /**
   * Deletes a repository by ID (cascades to all child scans).
   */
  async deleteRepository(id) {
    const text = `DELETE FROM repositories WHERE id = $1 RETURNING id`;
    const res = await db.query(text, [id]);
    return res.rows.length > 0;
  }

  /**
   * Saves a full completed scan into PostgreSQL inside a safe database transaction.
   * Parameterizes all fields across scans, scan_summaries, source_files,
   * file_metrics, function_metrics, duplicate_groups, and findings.
   */
  async saveFullScan(scanRecord) {
    return await db.withTransaction(async (client) => {
      // 1. Ensure repository exists in DB
      let repoId = scanRecord.repoId;
      if (repoId) {
        const existingRepo = await client.query(`SELECT id FROM repositories WHERE id = $1`, [repoId]);
        if (existingRepo.rows.length === 0) {
          const repoName = scanRecord.repoPath ? path.basename(scanRecord.repoPath) : 'Repository';
          const repoPath = scanRecord.repoPath || `/workspace/${repoId}`;
          await client.query(
            `INSERT INTO repositories (id, name, path, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (path) DO UPDATE SET updated_at = NOW();`,
            [repoId, repoName, repoPath]
          );
        }
      } else if (scanRecord.repoPath) {
        const repoRes = await client.query(
          `INSERT INTO repositories (id, name, path, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (path) DO UPDATE SET updated_at = NOW()
           RETURNING id;`,
          [`repo_${crypto.randomBytes(6).toString('hex')}`, path.basename(scanRecord.repoPath), scanRecord.repoPath]
        );
        repoId = repoRes.rows[0].id;
      }

      // 2. Insert Scan
      const scanSql = `
        INSERT INTO scans (id, repository_id, commit_hash, branch, status, engine_version, weights, duration_ms, started_at, completed_at, error_message)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            duration_ms = EXCLUDED.duration_ms,
            started_at = EXCLUDED.started_at,
            completed_at = EXCLUDED.completed_at,
            error_message = EXCLUDED.error_message
        RETURNING *;
      `;
      const report = scanRecord.report || {};
      const scanValues = [
        scanRecord.id,
        repoId,
        scanRecord.commitHash || null,
        scanRecord.branch || 'main',
        scanRecord.status || 'completed',
        report.engineVersion || '1.2.0',
        scanRecord.weights ? JSON.stringify(scanRecord.weights) : null,
        scanRecord.durationMs || 0,
        scanRecord.startedAt || null,
        scanRecord.completedAt || null,
        scanRecord.error || null
      ];
      await client.query(scanSql, scanValues);

      if (scanRecord.status !== 'completed' || !scanRecord.report) {
        return scanRecord;
      }

      const sum = report.summary || {};
      const debt = report.technicalDebt || {};

      // 3. Insert Scan Summary
      const summarySql = `
        INSERT INTO scan_summaries (
          scan_id, total_files, total_lines, total_code_lines, total_comment_lines, total_blank_lines,
          total_size_bytes, total_functions, average_complexity, max_complexity, high_complexity_function_count,
          total_duplicate_blocks, total_duplicate_lines, overall_duplication_percentage,
          repository_risk_score, overall_severity, formula, risk_distribution, files_by_language, lines_by_language
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        ON CONFLICT (scan_id) DO NOTHING;
      `;
      await client.query(summarySql, [
        scanRecord.id,
        sum.totalFiles || 0,
        sum.totalLines || 0,
        sum.totalCodeLines || 0,
        sum.totalCommentLines || 0,
        sum.totalBlankLines || 0,
        sum.totalSizeBytes || 0,
        sum.totalFunctions || 0,
        sum.averageComplexity || 0.0,
        sum.maxComplexity || 0,
        sum.highComplexityFunctionCount || 0,
        sum.totalDuplicateBlocks || 0,
        sum.totalDuplicateLines || 0,
        sum.overallDuplicationPercentage || 0.0,
        debt.repositoryRiskScore || 0.0,
        debt.overallSeverity || 'LOW',
        debt.formula || 'R = 0.45*C + 0.35*D + 0.20*S',
        JSON.stringify(debt.riskDistribution || {}),
        JSON.stringify(sum.filesByLanguage || {}),
        JSON.stringify(sum.linesByLanguage || {})
      ]);

      // 4. Insert Source Files & File Metrics & Functions
      const fileIdMap = new Map(); // relativePath -> fileId

      for (const file of report.files || []) {
        const fileId = `file_${crypto.randomBytes(8).toString('hex')}`;
        fileIdMap.set(file.relativePath, fileId);

        // Source file
        const fileSql = `
          INSERT INTO source_files (
            id, scan_id, relative_path, absolute_path, file_name, extension, language,
            file_size_bytes, total_lines, code_lines, comment_lines, blank_lines, max_line_length
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (scan_id, relative_path) DO UPDATE SET total_lines = EXCLUDED.total_lines
          RETURNING id;
        `;
        await client.query(fileSql, [
          fileId,
          scanRecord.id,
          file.relativePath,
          file.absolutePath || null,
          file.fileName,
          file.extension,
          file.language,
          file.fileSizeBytes || 0,
          file.totalLines || 0,
          file.codeLines || 0,
          file.commentLines || 0,
          file.blankLines || 0,
          file.maxLineLength || 0
        ]);

        // File metrics
        const comp = file.complexitySummary || {};
        const breakdown = file.riskBreakdown || {};
        const sub = breakdown.subScores || {};
        const struct = breakdown.structuralDetails || {};
        const prio = file.remediationPriority || {};

        const metricSql = `
          INSERT INTO file_metrics (
            source_file_id, scan_id, max_complexity, average_complexity, max_nesting_depth,
            total_functions, complex_function_count, duplicate_lines, duplicate_percentage,
            complexity_score, duplication_score, length_score, nesting_score, parameter_score,
            structural_score, risk_score, severity, remediation_priority, remediation_score,
            remediation_label, risk_factors, contributing_metrics
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
          );
        `;
        await client.query(metricSql, [
          fileId,
          scanRecord.id,
          comp.maxComplexity || 0,
          comp.averageComplexity || 0.0,
          comp.maxNestingDepth || 0,
          comp.totalFunctions || 0,
          comp.complexFunctionCount || 0,
          file.duplicateLines || 0,
          file.duplicatePercentage || 0.0,
          sub.complexity || 0.0,
          sub.duplication || 0.0,
          struct.lengthScore || 0.0,
          struct.nestingScore || 0.0,
          struct.parameterScore || 0.0,
          sub.structural || 0.0,
          file.riskScore || 0.0,
          file.severity || 'LOW',
          prio.priority || 'P4',
          prio.score || 0.0,
          prio.label || 'Low',
          JSON.stringify(breakdown.riskFactors || []),
          JSON.stringify(breakdown.contributingMetrics || [])
        ]);

        // Function metrics
        for (const fn of file.functions || []) {
          const fnSql = `
            INSERT INTO function_metrics (
              source_file_id, scan_id, name, start_line, end_line, start_column, end_column,
              line_count, parameter_count, cyclomatic_complexity, max_nesting_depth, is_high_complexity
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);
          `;
          await client.query(fnSql, [
            fileId,
            scanRecord.id,
            fn.name || 'anonymous',
            fn.startLine || 1,
            fn.endLine || 1,
            fn.startColumn || 1,
            fn.endColumn || 1,
            fn.lineCount || 1,
            fn.parameterCount || 0,
            fn.cyclomaticComplexity || 1,
            fn.maxNestingDepth || 0,
            !!fn.isHighComplexity
          ]);
        }
      }

      // 5. Insert Duplicate Groups & Members
      for (const grp of report.duplicateGroups || []) {
        const grpId = grp.id || `dup_${crypto.randomBytes(6).toString('hex')}`;
        await client.query(
          `INSERT INTO duplicate_groups (id, scan_id, line_count, token_count, sample_snippet)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING;`,
          [grpId, scanRecord.id, grp.lineCount || 0, grp.tokenCount || 0, grp.sampleSnippet || '']
        );

        for (const frag of grp.fragments || []) {
          const sourceFileId = fileIdMap.get(frag.filePath) || null;
          await client.query(
            `INSERT INTO duplicate_members (group_id, source_file_id, relative_path, start_line, end_line, line_count)
             VALUES ($1, $2, $3, $4, $5, $6);`,
            [grpId, sourceFileId, frag.filePath, frag.startLine, frag.endLine, frag.lineCount]
          );
        }
      }

      // 6. Insert Findings & Recommendations
      for (const rec of debt.recommendations || []) {
        await client.query(
          `INSERT INTO findings (scan_id, category, severity, title, description, finding_code)
           VALUES ($1, $2, $3, $4, $5, $6);`,
          [scanRecord.id, 'RECOMMENDATION', rec.severity, rec.title, rec.description, rec.id]
        );
      }

      for (const hotspot of debt.topHotspots || []) {
        await client.query(
          `INSERT INTO findings (scan_id, category, severity, title, description, related_file_path)
           VALUES ($1, $2, $3, $4, $5, $6);`,
          [
            scanRecord.id,
            'HOTSPOT',
            hotspot.severity,
            `Hotspot: ${hotspot.relativePath} (Score: ${hotspot.riskScore})`,
            hotspot.topFactor,
            hotspot.relativePath
          ]
        );
      }

      return scanRecord;
    });
  }

  /**
   * Retrieves full scan record from PostgreSQL.
   */
  async getScanById(scanId) {
    const scanRes = await db.query(`SELECT * FROM scans WHERE id = $1`, [scanId]);
    if (scanRes.rows.length === 0) return null;

    const s = scanRes.rows[0];
    const summaryRes = await db.query(`SELECT * FROM scan_summaries WHERE scan_id = $1`, [scanId]);
    const summaryRow = summaryRes.rows[0] || null;

    if (!summaryRow) {
      return {
        id: s.id,
        repoId: s.repository_id,
        status: s.status,
        createdAt: s.created_at,
        startedAt: s.started_at,
        completedAt: s.completed_at,
        durationMs: s.duration_ms,
        error: s.error_message,
        report: null
      };
    }

    // Retrieve files
    const filesRes = await db.query(
      `SELECT sf.*, fm.*
       FROM source_files sf
       JOIN file_metrics fm ON fm.source_file_id = sf.id
       WHERE sf.scan_id = $1
       ORDER BY fm.risk_score DESC;`,
      [scanId]
    );

    const files = filesRes.rows.map(row => ({
      relativePath: row.relative_path,
      absolutePath: row.absolute_path,
      fileName: row.file_name,
      extension: row.extension,
      language: row.language,
      totalLines: row.total_lines,
      codeLines: row.code_lines,
      commentLines: row.comment_lines,
      blankLines: row.blank_lines,
      maxLineLength: row.max_line_length,
      fileSizeBytes: Number(row.file_size_bytes),
      duplicateLines: row.duplicate_lines,
      duplicatePercentage: Number(row.duplicate_percentage),
      riskScore: Number(row.risk_score),
      severity: row.severity,
      remediationPriority: {
        priority: row.remediation_priority,
        score: Number(row.remediation_score),
        label: row.remediation_label
      },
      complexitySummary: {
        totalFunctions: row.total_functions,
        averageComplexity: Number(row.average_complexity),
        maxComplexity: row.max_complexity,
        maxNestingDepth: row.max_nesting_depth,
        complexFunctionCount: row.complex_function_count
      },
      riskBreakdown: {
        subScores: {
          complexity: Number(row.complexity_score),
          duplication: Number(row.duplication_score),
          structural: Number(row.structural_score)
        },
        structuralDetails: {
          lengthScore: Number(row.length_score),
          nestingScore: Number(row.nesting_score),
          parameterScore: Number(row.parameter_score)
        },
        riskFactors: row.risk_factors || [],
        contributingMetrics: row.contributing_metrics || []
      }
    }));

    return {
      id: s.id,
      repoId: s.repository_id,
      status: s.status,
      createdAt: s.created_at,
      startedAt: s.started_at,
      completedAt: s.completed_at,
      durationMs: s.duration_ms,
      report: {
        engineVersion: s.engine_version,
        scanTimestamp: s.completed_at || s.created_at,
        summary: {
          totalFiles: summaryRow.total_files,
          totalLines: summaryRow.total_lines,
          totalCodeLines: summaryRow.total_code_lines,
          totalCommentLines: summaryRow.total_comment_lines,
          totalBlankLines: summaryRow.total_blank_lines,
          totalSizeBytes: Number(summaryRow.total_size_bytes),
          totalFunctions: summaryRow.total_functions,
          averageComplexity: Number(summaryRow.average_complexity),
          maxComplexity: summaryRow.max_complexity,
          highComplexityFunctionCount: summaryRow.high_complexity_function_count,
          totalDuplicateBlocks: summaryRow.total_duplicate_blocks,
          totalDuplicateLines: summaryRow.total_duplicate_lines,
          overallDuplicationPercentage: Number(summaryRow.overall_duplication_percentage),
          filesByLanguage: summaryRow.files_by_language || {},
          linesByLanguage: summaryRow.lines_by_language || {}
        },
        technicalDebt: {
          repositoryRiskScore: Number(summaryRow.repository_risk_score),
          overallSeverity: summaryRow.overall_severity,
          formula: summaryRow.formula,
          riskDistribution: summaryRow.risk_distribution || {}
        },
        files
      }
    };
  }

  /**
   * Deletes a scan by ID (cascades automatically to all child tables).
   */
  async deleteScan(scanId) {
    const res = await db.query(`DELETE FROM scans WHERE id = $1 RETURNING id`, [scanId]);
    return res.rows.length > 0;
  }
}

module.exports = new ScanRepository();
