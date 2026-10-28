class DuplicateService {
  constructor(options = {}) {
    this.minBlockLines = options.minBlockLines || 5;
    this.minTokenChars = options.minTokenChars || 30;
    this.ignoreComments = options.ignoreComments !== undefined ? options.ignoreComments : true;
    this.normalizeWhitespace = options.normalizeWhitespace !== undefined ? options.normalizeWhitespace : true;
  }

  /**
   * Normalizes a line of source code: trims and collapses whitespace.
   */
  normalizeLine(line) {
    let trimmed = line.trim();
    if (!trimmed) return '';
    return trimmed.replace(/\s+/g, ' ');
  }

  /**
   * Preprocesses source code into normalized lines while preserving original line numbers.
   */
  preprocessFile(content) {
    const lines = [];
    const rawLines = content.split(/\r?\n/);
    let inBlockComment = false;

    rawLines.forEach((rawLine, idx) => {
      const lineNum = idx + 1;
      let stripped = '';

      if (this.ignoreComments) {
        for (let i = 0; i < rawLine.length; i++) {
          if (inBlockComment) {
            if (rawLine[i] === '*' && rawLine[i + 1] === '/') {
              inBlockComment = false;
              i++;
            }
            continue;
          }
          if (rawLine[i] === '/' && rawLine[i + 1] === '*') {
            inBlockComment = true;
            i++;
            continue;
          }
          if (rawLine[i] === '/' && rawLine[i + 1] === '/') {
            break; // Line comment consumes rest of line
          }
          stripped += rawLine[i];
        }
      } else {
        stripped = rawLine;
      }

      const norm = this.normalizeLine(stripped);
      if (norm) {
        lines.push({
          text: norm,
          originalLineNumber: lineNum
        });
      }
    });

    return lines;
  }

  /**
   * Generates a 64-bit FNV-1a style hash string for a block of normalized lines.
   */
  hashBlock(lines, start, count) {
    let combined = '';
    for (let i = 0; i < count; i++) {
      combined += lines[start + i].text + '\n';
    }

    // FNV-1a 32-bit hash implementation in JS
    let hash = 0x811c9dc5;
    for (let i = 0; i < combined.length; i++) {
      hash ^= combined.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16) + ':' + combined.length;
  }

  /**
   * Analyzes an array of { relativePath, content, totalLines } and returns duplication metrics and clone groups.
   */
  analyze(files) {
    const report = {
      totalDuplicateBlocks: 0,
      totalDuplicateLines: 0,
      overallDuplicationPercentage: 0,
      groups: [],
      duplicateLinesByFile: {},
      duplicatePercentageByFile: {}
    };

    if (!files || files.length === 0) return report;

    // 1. Preprocess all files
    const preprocessed = files.map(f => ({
      relativePath: f.relativePath,
      totalLines: f.totalLines || 0,
      normLines: this.preprocessFile(f.content)
    }));

    // 2. Sliding window block index: hash -> list of { fileIdx, lineIdx }
    const blockIndex = new Map();

    preprocessed.forEach((fileObj, fIdx) => {
      const normLines = fileObj.normLines;
      if (normLines.length < this.minBlockLines) return;

      for (let i = 0; i <= normLines.length - this.minBlockLines; i++) {
        let charCount = 0;
        for (let k = 0; k < this.minBlockLines; k++) {
          charCount += normLines[i + k].text.length;
        }
        if (charCount < this.minTokenChars) continue; // Skip trivial repeating characters (e.g. lone braces)

        const hash = this.hashBlock(normLines, i, this.minBlockLines);
        if (!blockIndex.has(hash)) {
          blockIndex.set(hash, []);
        }
        blockIndex.get(hash).push({ fileIdx: fIdx, lineIdx: i });
      }
    });

    // 3. Match pairs and extend forward to maximal clone length
    const rawPairs = [];

    for (const [hash, locs] of blockIndex.entries()) {
      if (locs.length < 2) continue;

      for (let a = 0; a < locs.length; a++) {
        for (let b = a + 1; b < locs.length; b++) {
          const loc1 = locs[a];
          const loc2 = locs[b];

          if (loc1.fileIdx === loc2.fileIdx && loc1.lineIdx === loc2.lineIdx) continue;

          let ext = this.minBlockLines;
          const lines1 = preprocessed[loc1.fileIdx].normLines;
          const lines2 = preprocessed[loc2.fileIdx].normLines;

          while (
            loc1.lineIdx + ext < lines1.length &&
            loc2.lineIdx + ext < lines2.length &&
            lines1[loc1.lineIdx + ext].text === lines2[loc2.lineIdx + ext].text
          ) {
            ext++;
          }

          rawPairs.push({
            file1: loc1.fileIdx,
            start1: loc1.lineIdx,
            file2: loc2.fileIdx,
            start2: loc2.lineIdx,
            length: ext
          });
        }
      }
    }

    // 4. Subsumption filter: remove sub-slices covered by longer clones
    const maximalPairs = [];
    for (let i = 0; i < rawPairs.length; i++) {
      let isSubsumed = false;
      const pi = rawPairs[i];

      for (let j = 0; j < rawPairs.length; j++) {
        if (i === j) continue;
        const pj = rawPairs[j];

        if (
          pj.file1 === pi.file1 &&
          pj.file2 === pi.file2 &&
          pj.start1 <= pi.start1 &&
          pj.start2 <= pi.start2 &&
          pj.start1 + pj.length >= pi.start1 + pi.length &&
          pj.start2 + pj.length >= pi.start2 + pi.length &&
          pj.length > pi.length
        ) {
          isSubsumed = true;
          break;
        }
      }

      if (!isSubsumed) {
        maximalPairs.push(pi);
      }
    }

    // 5. Cluster into duplicate groups
    const fileToDuplicatedLines = new Map();
    preprocessed.forEach(f => fileToDuplicatedLines.set(f.relativePath, new Set()));

    const seenClusterKeys = new Set();
    let groupCount = 0;

    maximalPairs.forEach(pair => {
      const path1 = preprocessed[pair.file1].relativePath;
      const path2 = preprocessed[pair.file2].relativePath;

      const origStart1 = preprocessed[pair.file1].normLines[pair.start1].originalLineNumber;
      const origEnd1 = preprocessed[pair.file1].normLines[pair.start1 + pair.length - 1].originalLineNumber;
      const origStart2 = preprocessed[pair.file2].normLines[pair.start2].originalLineNumber;
      const origEnd2 = preprocessed[pair.file2].normLines[pair.start2 + pair.length - 1].originalLineNumber;

      // Mark duplicated line numbers for per-file stats
      for (let l = origStart1; l <= origEnd1; l++) {
        fileToDuplicatedLines.get(path1).add(l);
      }
      for (let l = origStart2; l <= origEnd2; l++) {
        fileToDuplicatedLines.get(path2).add(l);
      }

      const clusterKey = `${path1}:${origStart1}_${path2}:${origStart2}`;
      if (seenClusterKeys.has(clusterKey)) return;
      seenClusterKeys.add(clusterKey);

      groupCount++;
      const id = `DUP-${String(groupCount).padStart(3, '0')}`;

      // Sample preview
      const previewLines = [];
      const previewCount = Math.min(pair.length, 3);
      for (let k = 0; k < previewCount; k++) {
        previewLines.push(preprocessed[pair.file1].normLines[pair.start1 + k].text);
      }

      const grp = {
        id,
        lineCount: pair.length,
        sampleSnippet: previewLines.join('\n'),
        fragments: [
          {
            filePath: path1,
            startLine: origStart1,
            endLine: origEnd1,
            lineCount: origEnd1 - origStart1 + 1
          },
          {
            filePath: path2,
            startLine: origStart2,
            endLine: origEnd2,
            lineCount: origEnd2 - origStart2 + 1
          }
        ]
      };

      report.groups.push(grp);
    });

    report.totalDuplicateBlocks = report.groups.length;

    // 6. Compute per-file and repository totals
    let totalDupLinesAllFiles = 0;
    let totalCodeLinesAllFiles = 0;

    preprocessed.forEach(f => {
      const dupSet = fileToDuplicatedLines.get(f.relativePath);
      const dupCount = dupSet ? dupSet.size : 0;
      report.duplicateLinesByFile[f.relativePath] = dupCount;

      totalDupLinesAllFiles += dupCount;
      totalCodeLinesAllFiles += f.totalLines;

      const pct = f.totalLines > 0 ? parseFloat(((dupCount * 100) / f.totalLines).toFixed(2)) : 0;
      report.duplicatePercentageByFile[f.relativePath] = pct;
    });

    report.totalDuplicateLines = totalDupLinesAllFiles;
    report.overallDuplicationPercentage =
      totalCodeLinesAllFiles > 0
        ? parseFloat(((totalDupLinesAllFiles * 100) / totalCodeLinesAllFiles).toFixed(2))
        : 0;

    return report;
  }
}

module.exports = new DuplicateService();

