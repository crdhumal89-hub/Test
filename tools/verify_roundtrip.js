'use strict';
/**
 * Asserts join(split(x)) === x byte for byte on the pristine baseline.
 * If this ever fails the whole build pipeline is untrustworthy, so it runs
 * as the first step of the build.
 */
const fs = require('fs');
const codec = require('./codec');

const SRC = process.argv[2] || 'baseline/TRACE_Platform_-_PATCHED.html';
const source = fs.readFileSync(SRC, 'utf8');
const { shell, modules } = codec.split(source);
const rebuilt = codec.join(shell, modules);

if (rebuilt === source) {
  console.log('roundtrip OK: ' + SRC + ' (' + source.length + ' chars)');
  for (const name of codec.MODULES) {
    console.log('  ' + name + ': ' + modules[name].length + ' chars decoded');
  }
  process.exit(0);
}

console.error('ROUNDTRIP MISMATCH for ' + SRC);
console.error('  original length: ' + source.length);
console.error('  rebuilt  length: ' + rebuilt.length);
const n = Math.min(source.length, rebuilt.length);
for (let i = 0; i < n; i++) {
  if (source[i] !== rebuilt[i]) {
    console.error('  first diff at index ' + i);
    console.error('  original: ' + JSON.stringify(source.slice(i - 60, i + 60)));
    console.error('  rebuilt : ' + JSON.stringify(rebuilt.slice(i - 60, i + 60)));
    break;
  }
}
process.exit(1);
