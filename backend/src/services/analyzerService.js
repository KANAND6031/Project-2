const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class AnalyzerService {
  constructor() {
    // Locate the C++ analyzer executable relative to the project root
    const projectRoot = path.resolve(__dirname, '../../../');
    const isWindows = process.platform === 'win32';
    const exeName = isWindows ? 'codeinsight-analyzer.exe' : 'codeinsight-analyzer';

    // Search common build/bin paths
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
   * Runs the C++ analyzer executable against a target repository directory.
   * @param {string} repoDirectory - Target directory to scan.
   * @param {number} [timeoutMs=30000] - Process timeout in milliseconds.
   * @returns {Promise<object>} Parsed JSON report from the C++ analyzer.
   */
  runScan(repoDirectory, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      // 1. Validate repository path
      if (!repoDirectory || typeof repoDirectory !== 'string') {
        return reject(new Error('Invalid repository directory specified.'));
      }

      const absoluteTarget = path.resolve(repoDirectory);
      if (!fs.existsSync(absoluteTarget)) {
        return reject(new Error(`Repository directory does not exist: ${absoluteTarget}`));
      }

      const stat = fs.statSync(absoluteTarget);
      if (!stat.isDirectory()) {
        return reject(new Error(`Path is not a directory: ${absoluteTarget}`));
      }

      // 2. Validate analyzer binary
      if (!fs.existsSync(this.executablePath)) {
        return reject(
          new Error(
            `C++ Analyzer executable not found at: ${this.executablePath}. Please build the analyzer first.`
          )
        );
      }

      // 3. Spawn child process safely using argument array (prevents command injection)
      const args = ['--repo', absoluteTarget];
      const child = spawn(this.executablePath, args, {
        windowsHide: true
      });

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
        reject(new Error(`Failed to start analyzer process: ${err.message}`));
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
          reject(
            new Error(
              `Failed to parse analyzer JSON output: ${jsonErr.message}. Output was: ${stdoutData.slice(0, 300)}`
            )
          );
        }
      });
    });
  }
}

module.exports = new AnalyzerService();
