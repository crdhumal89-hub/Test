'use strict';
/** Decode the platform file's embedded modules into src/ for editing. */
const fs = require('fs');
const path = require('path');
const codec = require('./codec');

const SRC = process.argv[2] || 'baseline/TRACE_Platform_-_PATCHED.html';
const OUT = 'src';

const source = fs.readFileSync(SRC, 'utf8');
const { shell, modules } = codec.split(source);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'shell.html'), shell);
fs.writeFileSync(path.join(OUT, 'mod_trace.html'), modules.MOD_TRACE);
fs.writeFileSync(path.join(OUT, 'mod_tracepro.html'), modules.MOD_TRACEPRO);

console.log('extracted from ' + SRC);
console.log('  src/shell.html         ' + shell.length);
console.log('  src/mod_trace.html     ' + modules.MOD_TRACE.length);
console.log('  src/mod_tracepro.html  ' + modules.MOD_TRACEPRO.length);
