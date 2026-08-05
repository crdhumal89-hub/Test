'use strict';
/**
 * Reassemble src/ into the single self-contained dist/TRACE_Platform.html.
 * This is a developer build step only; the emitted file opens by
 * double-clicking with no tooling of any kind.
 */
const fs = require('fs');
const path = require('path');
const codec = require('./codec');

const OUT = process.argv[2] || 'dist/TRACE_Platform.html';

const shell = fs.readFileSync('src/shell.html', 'utf8');
const modules = {
  MOD_TRACE:    fs.readFileSync('src/mod_trace.html', 'utf8'),
  MOD_TRACEPRO: fs.readFileSync('src/mod_tracepro.html', 'utf8')
};

const out = codec.join(shell, modules);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log('built ' + OUT + ' (' + out.length + ' chars, ' +
            Buffer.byteLength(out, 'utf8') + ' bytes)');
