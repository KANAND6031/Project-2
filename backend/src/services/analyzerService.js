const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const astEngine = require('./astEngine');
const duplicateService = require('./duplicateService');

class AnalyzerService {
  constructor() {
    const projectRoot = path.resolve(__dirname, '../../../');
    const isWindows = process.platform === 'win32';
    const exeName = isWindows ? 'codeinsight-analyzer.exe' : 'codeinsight-analyzer';

    const candidatePaths = [
      path.join(projectRoot, 'analyzer', 'bin', exeName),
      path.join(projectRoot, 'analyzer', 'build', 'bin', exeName),
      path.join(projectRoot, 'analyzer', 'build', exeName),
      path.join(projectRoot, 'analyzer', exeName)
    ];

    this.executablePath = candidatePaths.find(p => fs.existsSync(p)) || candidatePaths[0];
  }

  getExecutablePath() {
    return this.executablePath;
  }

  /**
   * Runs the code analysis on the target repository.
   * Tries the standalone C++ executable first, with automatic fallback
   * to AST engine if host security policies (such as Windows WDAC) intercept binary execution.
   */
  async runScan(repoDirectory, timeoutMs = 30000) {
    if (!repoDirectory || typeof repoDirectory !== 'string') {
      throw new Error('Invalid repository directory specified.');
    }

    const absoluteTarget = path.resolve(repoDirectory);
    if (!fs.existsSync(absoluteTarget)) {
      throw new Error(`Repository directory does not exist: ${absoluteTarget}`);
    }

    const stat = fs.statSync(absoluteTarget);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${absoluteTarget}`);
    }

    // Try native C++ analysis engine first
    if (fs.existsSync(this.executablePath)) {
      try {
        const nativeReport = await this.executeNativeBinary(absoluteTarget, timeoutMs);
        if (nativeReport.summary && nativeReport.summary.totalFunctions > 0 && nativeReport.duplicateGroups) {
          return nativeReport;
        }
        return this.enrichWithAstAndDuplication(nativeReport, absoluteTarget);
      } catch (err) {
        console.warn(
          `[CodeInsight Engine] Native binary execution bypassed (${err.message}). Engaging integrated AST & clone analysis engine.`
        );
      }
    }

    return this.runFallbackScan(absoluteTarget);
  }

  executeNativeBinary(absoluteTarget, timeoutMs) {
    return new Promise((resolve, reject) => {
      const args = ['--repo', absoluteTarget];
      const child = spawn(this.executablePath, args, { windowsHide: true });

      let stdoutData = '';
      let stderrData = '';
      let isTimedOut = false;

      const timer = setTimeout(() => {
        isTimedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout.on('data', chunk => {
        stdoutData += chunk.toString();
      });

      child.stderr.on('data', chunk => {
        stderrData += chunk.toString();
      });

      child.on('error', err => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', code => {
        clearTimeout(timer);

        if (isTimedOut) {
          return reject(new Error(`Analyzer process timed out after ${timeoutMs}ms.`));
        }

        if (code !== 0) {
          return reject(
            new Error(
              `Analyzer exited with code ${code}. Stderr: ${stderrData.trim() || 'No stderr output'}`
            )
          );
        }

        try {
          const report = JSON.parse(stdoutData.trim());
          resolve(report);
        } catch (jsonErr) {
          reject(new Error(`Failed to parse analyzer JSON output: ${jsonErr.message}`));
        }
      });
    });
  }

  /**
   * Enriches native scanner report with AST function metrics & duplicate groups if needed.
   */
  enrichWithAstAndDuplication(report, rootDir) {
    let totalFuncs = 0;
    let sumComp = 0;
    let maxComp = 0;
    let highCompCount = 0;
    const filesWithContent = [];

    for (const file of report.files) {
      const fullPath = path.isAbsolute(file.absolutePath)
        ? file.absolutePath
        : path.join(rootDir, file.relativePath);

      let content = '';
      if (fs.existsSync(fullPath)) {
        content = fs.readFileSync(fullPath, 'utf8');
        filesWithContent.push({
          relativePath: file.relativePath,
          content,
          totalLines: file.totalLines
        });
      }

      if (!file.complexitySummary || file.complexitySummary.totalFunctions === 0) {
        if (content) {
          const complexity = astEngine.analyzeFile(fullPath, content, file.language);
          file.complexitySummary = {
            totalFunctions: complexity.totalFunctions,
            averageComplexity: complexity.averageComplexity,
            maxComplexity: complexity.maxComplexity,
            maxNestingDepth: complexity.maxNestingDepth,
            complexFunctionCount: complexity.complexFunctionCount
          };
          file.functions = complexity.functions;
        }
      }

      if (file.complexitySummary) {
        totalFuncs += file.complexitySummary.totalFunctions;
        for (const fn of file.functions || []) {
          sumComp += fn.cyclomaticComplexity;
          if (fn.cyclomaticComplexity > maxComp) maxComp = fn.cyclomaticComplexity;
          if (fn.isHighComplexity) highCompCount++;
        }
      }
    }

    report.summary.totalFunctions = totalFuncs;
    report.summary.averageComplexity = totalFuncs > 0 ? parseFloat((sumComp / totalFuncs).toFixed(2)) : 0;
    report.summary.maxComplexity = maxComp;
    report.summary.highComplexityFunctionCount = highCompCount;

    // Run duplicate detection
    const dupReport = duplicateService.analyze(filesWithContent);
    report.duplicateGroups = dupReport.groups;
    report.summary.totalDuplicateBlocks = dupReport.totalDuplicateBlocks;
    report.summary.totalDuplicateLines = dupReport.totalDuplicateLines;
    report.summary.overallDuplicationPercentage = dupReport.overallDuplicationPercentage;

    for (const file of report.files) {
      file.duplicateLines = dupReport.duplicateLinesByFile[file.relativePath] || 0;
      file.duplicatePercentage = dupReport.duplicatePercentageByFile[file.relativePath] || 0;
    }

    return report;
  }

  /**
   * Pure Node.js fallback scanner with AST parsing and code duplication detection.
   */
  runFallbackScan(rootDir) {
    const report = {
      engineVersion: '1.2.0-fallback',
      repoPath: rootDir.replace(/\\/g, '/'),
      scanTimestamp: new Date().toISOString(),
      summary: {
        totalFiles: 0,
        totalLines: 0,
        totalCodeLines: 0,
        totalCommentLines: 0,
        totalBlankLines: 0,
        totalMixedLines: 0,
        totalSizeBytes: 0,
        skippedFilesCount: 0,
        errorCount: 0,
        totalFunctions: 0,
        averageComplexity: 0,
        maxComplexity: 0,
        highComplexityFunctionCount: 0,
        totalDuplicateBlocks: 0,
        totalDuplicateLines: 0,
        overallDuplicationPercentage: 0,
        filesByLanguage: {},
        linesByLanguage: {}
      },
      files: [],
      duplicateGroups: [],
      skippedFiles: [],
      errors: []
    };

    const excludedDirs = new Set([
      '.git', '.svn', '.hg', 'node_modules', 'vendor', 'bower_components',
      'build', 'bin', 'obj', 'dist', 'out', 'target',
      '.vscode', '.idea', '.vs', '.settings',
      'cmake-build-debug', 'cmake-build-release',
      '.gemini', 'coverage', '.next', '.nuxt', 'tmp', 'temp'
    ]);

    // Load .gitignore
    const gitignorePath = path.join(rootDir, '.gitignore');
    const gitignoreRules = [];
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      gitignoreContent.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          gitignoreRules.push(trimmed.replace(/^\//, '').replace(/\/$/, ''));
        }
      });
    }

    const isGitignored = relPath => {
      const norm = relPath.replace(/\\/g, '/');
      const base = path.basename(norm);
      return gitignoreRules.some(r => norm === r || norm.startsWith(r + '/') || base === r);
    };

    const filesForDuplication = [];

    const walk = currentDir => {
      let entries;
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch (err) {
        report.errors.push(`Could not read directory: ${currentDir}`);
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          if (excludedDirs.has(entry.name)) {
            report.skippedFiles.push({
              relativePath: relPath,
              reason: 'EXCLUDED_DIRECTORY',
              details: 'Directory in standard exclusion list'
            });
            continue;
          }
          if (isGitignored(relPath)) {
            report.skippedFiles.push({
              relativePath: relPath,
              reason: 'GITIGNORED',
              details: 'Ignored by .gitignore pattern'
            });
            continue;
          }
          walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          let lang = null;

          if (['.cpp', '.hpp', '.cc', '.cxx', '.c', '.h', '.hh'].includes(ext)) {
            lang = 'cpp';
          } else if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
            lang = 'javascript';
          } else if (['.ts', '.tsx'].includes(ext)) {
            lang = 'typescript';
          }

          if (!lang) {
            report.skippedFiles.push({
              relativePath: relPath,
              reason: 'UNSUPPORTED_EXTENSION',
              details: 'Extension not recognized as supported source code'
            });
            continue;
          }

          if (isGitignored(relPath)) {
            report.skippedFiles.push({
              relativePath: relPath,
              reason: 'GITIGNORED',
              details: 'Ignored by .gitignore pattern'
            });
            continue;
          }

          const stat = fs.statSync(fullPath);
          if (stat.size > 5 * 1024 * 1024) {
            report.skippedFiles.push({
              relativePath: relPath,
              reason: 'EXCEEDS_SIZE_LIMIT',
              details: 'File exceeds 5MB limit'
            });
            continue;
          }

          // Check if binary file
          const buf = Buffer.alloc(Math.min(stat.size, 4096));
          const fd = fs.openSync(fullPath, 'r');
          const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
          fs.closeSync(fd);
          let isBin = false;
          if (bytesRead > 0) {
            let nonPrintable = 0;
            for (let i = 0; i < bytesRead; i++) {
              if (buf[i] === 0) { isBin = true; break; }
              if (buf[i] < 9 || (buf[i] > 13 && buf[i] < 32)) nonPrintable++;
            }
            if ((nonPrintable * 100 / bytesRead) > 30) isBin = true;
          }
          if (isBin) {
            report.skippedFiles.push({
              relativePath: relPath,
              reason: 'BINARY_FILE',
              details: 'Detected non-printable or null bytes in file content'
            });
            continue;
          }

          // Check minified file
          if (entry.name.includes('.min.') || entry.name.includes('.bundle.')) {
            report.skippedFiles.push({
              relativePath: relPath,
              reason: 'MINIFIED_OR_GENERATED',
              details: 'Minified file name pattern'
            });
            continue;
          }

          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split(/\r?\n/);

          let codeLines = 0;
          let commentLines = 0;
          let blankLines = 0;
          let mixedLines = 0;
          let maxLineLen = 0;

          lines.forEach(line => {
            const trimmed = line.trim();
            if (line.length > maxLineLen) maxLineLen = line.length;

            if (!trimmed) {
              blankLines++;
            } else if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
              commentLines++;
            } else {
              codeLines++;
            }
          });

          if (maxLineLen > 1000) {
            report.skippedFiles.push({
              relativePath: relPath,
              reason: 'MINIFIED_OR_GENERATED',
              details: 'Line length exceeds 1000 chars'
            });
            continue;
          }

          // AST metrics
          const complexity = astEngine.analyzeFile(fullPath, content, lang);

          const fileMetric = {
            relativePath: relPath,
            absolutePath: fullPath.replace(/\\/g, '/'),
            fileName: entry.name,
            extension: ext,
            language: lang,
            totalLines: lines.length,
            codeLines,
            commentLines,
            blankLines,
            mixedLines,
            maxLineLength: maxLineLen,
            hasLongLines: false,
            fileSizeBytes: stat.size,
            duplicateLines: 0,
            duplicatePercentage: 0,
            complexitySummary: {
              totalFunctions: complexity.totalFunctions,
              averageComplexity: complexity.averageComplexity,
              maxComplexity: complexity.maxComplexity,
              maxNestingDepth: complexity.maxNestingDepth,
              complexFunctionCount: complexity.complexFunctionCount
            },
            functions: complexity.functions
          };

          report.files.push(fileMetric);
          filesForDuplication.push({
            relativePath: relPath,
            content,
            totalLines: lines.length
          });

          report.summary.totalFiles++;
          report.summary.totalLines += lines.length;
          report.summary.totalCodeLines += codeLines;
          report.summary.totalCommentLines += commentLines;
          report.summary.totalBlankLines += blankLines;
          report.summary.totalMixedLines += mixedLines;
          report.summary.totalSizeBytes += stat.size;

          report.summary.filesByLanguage[lang] = (report.summary.filesByLanguage[lang] || 0) + 1;
          report.summary.linesByLanguage[lang] = (report.summary.linesByLanguage[lang] || 0) + lines.length;

          report.summary.totalFunctions += complexity.totalFunctions;
          if (complexity.maxComplexity > report.summary.maxComplexity) {
            report.summary.maxComplexity = complexity.maxComplexity;
          }
          report.summary.highComplexityFunctionCount += complexity.complexFunctionCount;
        }
      }
    };

    walk(rootDir);

    report.summary.skippedFilesCount = report.skippedFiles.length;
    report.summary.errorCount = report.errors.length;

    if (report.summary.totalFunctions > 0) {
      let sumComp = 0;
      for (const f of report.files) {
        for (const fn of f.functions || []) {
          sumComp += fn.cyclomaticComplexity;
        }
      }
      report.summary.averageComplexity = parseFloat((sumComp / report.summary.totalFunctions).toFixed(2));
    }

    // Phase 4 Duplication analysis across analyzed files
    const dupReport = duplicateService.analyze(filesForDuplication);
    report.duplicateGroups = dupReport.groups;
    report.summary.totalDuplicateBlocks = dupReport.totalDuplicateBlocks;
    report.summary.totalDuplicateLines = dupReport.totalDuplicateLines;
    report.summary.overallDuplicationPercentage = dupReport.overallDuplicationPercentage;

    for (const f of report.files) {
      f.duplicateLines = dupReport.duplicateLinesByFile[f.relativePath] || 0;
      f.duplicatePercentage = dupReport.duplicatePercentageByFile[f.relativePath] || 0;
    }

    return report;
  }
}

module.exports = new AnalyzerService();
