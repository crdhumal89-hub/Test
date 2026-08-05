'use strict';
/**
 * codec.js - lossless split/join for the TRACE Platform single-file app.
 *
 * The platform file embeds two full HTML documents as single-line JS string
 * literals (window.MOD_TRACE / window.MOD_TRACEPRO) which the shell assigns to
 * iframe .srcdoc. Editing 1 MB of escaped text in place is not workable, so we
 * decode the literals to real HTML, edit those, and re-encode.
 *
 * The encoder MUST be byte-exact: encode(decode(x)) === x for the untouched
 * source, or every downstream comparison is meaningless. verify_roundtrip.js
 * asserts exactly that.
 */

const fs = require('fs');

const MODULES = ['MOD_TRACE', 'MOD_TRACEPRO'];

/**
 * The two literals were produced by different generators, so they escape
 * non-ASCII differently: MOD_TRACE keeps raw UTF-8, MOD_TRACEPRO writes
 * \uXXXX. Both conventions are byte-verified by verify_roundtrip.js.
 */
const POLICY = {
  MOD_TRACE:    { escapeNonAscii: false },
  MOD_TRACEPRO: { escapeNonAscii: true  }
};

const NON_ASCII = new RegExp('[\\u0080-\\uffff]', 'g');

/** Locate `window.<name> = "...";` and return the indices of the literal body. */
function findLiteral(source, name) {
  const prefix = 'window.' + name + ' = "';
  const start = source.indexOf(prefix);
  if (start === -1) throw new Error('codec: could not find literal for ' + name);
  const bodyStart = start + prefix.length;
  // Walk forward honouring backslash escapes to find the closing quote.
  let i = bodyStart;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === '"') break;
    i++;
  }
  if (i >= source.length) throw new Error('codec: unterminated literal for ' + name);
  return { prefixStart: start, bodyStart: bodyStart, bodyEnd: i };
}

/** Decode a JS/JSON double-quoted string body into real text. */
function decode(body) {
  return JSON.parse('"' + body + '"');
}

/**
 * Encode text back into the escaping convention the source file uses:
 * JSON escapes, optionally every non-ASCII char as \uXXXX, and `</` written
 * as `<\/` so a nested </script> cannot terminate the host script element.
 */
function encode(text, opts) {
  const escapeNonAscii = !!(opts && opts.escapeNonAscii);
  let out = JSON.stringify(text);
  out = out.slice(1, -1);                    // drop JSON's own quotes
  if (escapeNonAscii) {
    out = out.replace(NON_ASCII, function (c) {
      return '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
    });
  }
  out = out.replace(/<\//g, '<\\/');         // </script> safety
  return out;
}

/** Split the platform file into { shell, modules{name:html} }. */
function split(source) {
  const modules = {};
  const marks = [];
  for (const name of MODULES) {
    const loc = findLiteral(source, name);
    modules[name] = decode(source.slice(loc.bodyStart, loc.bodyEnd));
    marks.push({ name, loc });
  }
  marks.sort((a, b) => b.loc.bodyStart - a.loc.bodyStart);
  let shell = source;
  for (const m of marks) {
    shell = shell.slice(0, m.loc.bodyStart) +
            '@@' + m.name + '@@' +
            shell.slice(m.loc.bodyEnd);
  }
  return { shell, modules };
}

/** Rebuild the platform file from a shell template plus decoded modules. */
function join(shell, modules) {
  let out = shell;
  for (const name of MODULES) {
    const token = '@@' + name + '@@';
    if (out.indexOf(token) === -1) throw new Error('codec: shell is missing ' + token);
    const encoded = encode(modules[name], POLICY[name]);
    out = out.replace(token, function () { return encoded; });
  }
  return out;
}

function readSource(file) {
  return fs.readFileSync(file, 'utf8');
}

module.exports = {
  MODULES, POLICY, split, join, decode, encode, findLiteral, readSource
};
