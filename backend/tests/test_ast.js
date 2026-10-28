const assert = require('assert');
const fs = require('fs');
const path = require('path');
const astEngine = require('../src/services/astEngine');

console.log('[Test Suite] Running CodeInsight Phase 3 AST & Complexity Tests...\n');

// Test 1: C++ AST analysis on complex_functions.cpp
{
  process.stdout.write('  - Testing C++ function extraction & complexity... ');
  const code = fs.readFileSync(path.resolve(__dirname, '../../test-fixtures/complex-repo/complex_functions.cpp'), 'utf8');
  const res = astEngine.analyzeFile('complex_functions.cpp', code, 'cpp');

  assert.strictEqual(res.totalFunctions, 3, 'Should detect exactly 3 functions');
  assert.strictEqual(res.maxComplexity, 11, 'Max complexity should be 11');
  assert.strictEqual(res.maxNestingDepth, 4, 'Max nesting depth should be 4');
  assert.strictEqual(res.complexFunctionCount, 1, 'Should flag 1 high-complexity function');

  const deepFn = res.functions.find(f => f.name === 'deepNesting');
  assert(deepFn, 'deepNesting function must exist');
  assert.strictEqual(deepFn.maxNestingDepth, 4, 'deepNesting must have nesting depth 4');
  assert.strictEqual(deepFn.parameterCount, 1, 'deepNesting must have 1 parameter');

  const complexFn = res.functions.find(f => f.name === 'complexDecisionLogic');
  assert(complexFn, 'complexDecisionLogic function must exist');
  assert.strictEqual(complexFn.cyclomaticComplexity, 11, 'complexDecisionLogic complexity must be 11');
  assert.strictEqual(complexFn.isHighComplexity, true, 'isHighComplexity must be true');

  console.log('PASSED (3 functions, maxComplexity=11, maxNesting=4)');
}

// Test 2: JavaScript AST analysis on math_utils.js
{
  process.stdout.write('  - Testing JavaScript function & AST extraction... ');
  const code = fs.readFileSync(path.resolve(__dirname, '../../test-fixtures/sample-repo/math_utils.js'), 'utf8');
  const res = astEngine.analyzeFile('math_utils.js', code, 'javascript');

  assert.strictEqual(res.totalFunctions, 2, 'Should detect exactly 2 functions');
  assert.strictEqual(res.maxComplexity, 2, 'Max complexity should be 2');

  const factFn = res.functions.find(f => f.name === 'factorial');
  assert(factFn, 'factorial function must exist');
  assert.strictEqual(factFn.cyclomaticComplexity, 2, 'factorial complexity should be 2 (baseline 1 + if)');
  assert.strictEqual(factFn.parameterCount, 1, 'factorial must have 1 parameter');

  const evenFn = res.functions.find(f => f.name === 'isEven');
  assert(evenFn, 'isEven function must exist');
  assert.strictEqual(evenFn.cyclomaticComplexity, 1, 'isEven complexity should be 1');

  console.log('PASSED (2 functions, factorial=2, isEven=1)');
}

console.log('\n[ALL PHASE 3 TESTS PASSED SUCCESSFULLY]\n');

