'use strict';
/**
 * Confirms a cycle's diff is confined to the blocks the cycle record names.
 *   node tools/diff_cycle.js baseline/precycle_TRACE_Platform.html dist/TRACE_Platform.html
 */
const fs = require('fs');
const codec = require('./codec');

const BLOCKS = ['phase1-css', 'phase1-js', 'cycle1-css', 'cycle1-js'];

function blockRe(id) {
  return new RegExp('<(style|script) id="' + id + '">([\\s\\S]*?)</\\1>');
}
function getBlock(text, id) {
  const m = text.match(blockRe(id));
  return m ? m[2] : null;
}
/**
 * Delete the named blocks outright rather than leaving a placeholder: a block that is
 * new on one side only would otherwise show up as a difference in the surrounding text.
 * Trailing whitespace left behind by the deletion is collapsed for the same reason.
 */
function stripBlocks(text) {
  let out = text;
  for (const id of BLOCKS) out = out.replace(blockRe(id), '');
  return out.replace(/\s+/g, ' ');
}

const A = codec.split(fs.readFileSync(process.argv[2], 'utf8'));
const B = codec.split(fs.readFileSync(process.argv[3], 'utf8'));

console.log('shell:        ' + (A.shell === B.shell ? 'identical' : 'CHANGED'));
console.log('MOD_TRACE:    ' + (A.modules.MOD_TRACE === B.modules.MOD_TRACE ? 'identical' : 'CHANGED'));

const a = A.modules.MOD_TRACEPRO, b = B.modules.MOD_TRACEPRO;
const outsideSame = stripBlocks(a) === stripBlocks(b);
console.log('MOD_TRACEPRO outside the named blocks: ' + (outsideSame ? 'identical' : 'CHANGED'));

for (const id of BLOCKS) {
  const x = getBlock(a, id), y = getBlock(b, id);
  let state;
  if (x === null && y === null) state = 'absent from both';
  else if (x === null) state = 'ADDED (' + y.length + ' chars)';
  else if (y === null) state = 'REMOVED';
  else if (x === y) state = 'identical';
  else state = 'CHANGED';
  console.log('  ' + id.padEnd(12) + state);
  if (state === 'CHANGED') {
    let i = 0; while (i < x.length && i < y.length && x[i] === y[i]) i++;
    let j = 0; while (j < x.length - i && j < y.length - i && x[x.length - 1 - j] === y[y.length - 1 - j]) j++;
    console.log('      removed: ' + JSON.stringify(x.slice(i, x.length - j)));
    console.log('      added:   ' + JSON.stringify(y.slice(i, y.length - j)));
  }
}
process.exit(outsideSame ? 0 : 1);
