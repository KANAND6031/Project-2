/**
 * math_utils.js - Sample JavaScript file for CodeInsight scanner verification
 */

function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

function isEven(num) {
  return num % 2 === 0;
}

module.exports = { factorial, isEven };
