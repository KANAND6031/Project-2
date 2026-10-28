const assert = require('assert');
const fs = require('fs');
const path = require('path');
const duplicateService = require('../src/services/duplicateService');

console.log('[Test Suite] Running CodeInsight Phase 4 Duplicate Code Detection Tests...\n');

// Test 1: Line Normalization
{
  process.stdout.write('  - Testing normalizeLine()... ');
  const raw = '   int   x  =    a   +   b;   ';
  const norm = duplicateService.normalizeLine(raw);
  assert.strictEqual(norm, 'int x = a + b;');
  console.log('PASSED');
}

// Test 2: Duplicate Block Detection on duplication-repo
{
  process.stdout.write('  - Testing multi-file duplicate clone detection... ');
  const repoDir = path.resolve(__dirname, '../../test-fixtures/duplication-repo');
  const files = ['file_a.cpp', 'file_b.cpp', 'file_c.js', 'file_d.js'].map(name => {
    const filePath = path.join(repoDir, name);
    const content = fs.readFileSync(filePath, 'utf8');
    return {
      relativePath: name,
      content,
      totalLines: content.split(/\r?\n/).length
    };
  });

  const report = duplicateService.analyze(files);

  assert.strictEqual(report.totalDuplicateBlocks, 2, 'Must detect exactly 2 duplicate groups');
  assert.strictEqual(report.totalDuplicateLines, 38, 'Must calculate total duplicate lines as 38');
  assert(report.overallDuplicationPercentage > 45, 'Overall duplication must exceed 45%');

  // Verify Group 1: C++ bubble sort
  const cppGroup = report.groups.find(g => g.fragments.some(f => f.filePath === 'file_a.cpp'));
  assert(cppGroup, 'Must identify C++ duplicate group between file_a and file_b');
  assert.strictEqual(cppGroup.fragments.length, 2, 'Group must link both occurrences');
  assert.strictEqual(cppGroup.lineCount, 11, 'Duplicate block must span 11 lines');

  // Verify Group 2: JavaScript validation logic
  const jsGroup = report.groups.find(g => g.fragments.some(f => f.filePath === 'file_c.js'));
  assert(jsGroup, 'Must identify JS duplicate group between file_c and file_d');
  assert.strictEqual(jsGroup.fragments.length, 2, 'Group must link both occurrences');
  assert.strictEqual(jsGroup.lineCount, 8, 'Duplicate block must span 8 lines');

  // Verify per-file percentage calculations
  assert(report.duplicateLinesByFile['file_a.cpp'] === 11, 'file_a.cpp must have 11 duplicate lines');
  assert(report.duplicatePercentageByFile['file_a.cpp'] === 50, 'file_a.cpp must have 50% duplication');

  console.log(`PASSED (${report.totalDuplicateBlocks} groups detected, ${report.totalDuplicateLines} lines duplicated)`);
}

// Test 3: Trivial Boilerplate Suppression (e.g., repeating closing braces)
{
  process.stdout.write('  - Testing trivial boilerplate repetition filter... ');
  const trivialFile1 = {
    relativePath: 'trivial1.js',
    content: '}\n}\n}\n}\n}\n',
    totalLines: 5
  };
  const trivialFile2 = {
    relativePath: 'trivial2.js',
    content: '}\n}\n}\n}\n}\n',
    totalLines: 5
  };

  const report = duplicateService.analyze([trivialFile1, trivialFile2]);
  assert.strictEqual(report.totalDuplicateBlocks, 0, 'Trivial repeating braces must be filtered out');
  console.log('PASSED (trivial 5 braces ignored)');
}

console.log('\n[ALL PHASE 4 TESTS PASSED SUCCESSFULLY]\n');

