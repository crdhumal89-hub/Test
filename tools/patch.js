'use strict';
/**
 * patch.js - the whole Phase 1 change set, applied to the pristine decoded modules.
 *
 *   node tools/patch.js [out=dist/TRACE_Platform.html]
 *
 * src/ is never edited: it stays a byte-exact decode of the delivered file, so this
 * script is the complete, reviewable diff. Every anchor is asserted, so a silent
 * mis-apply is impossible - if the source moves, the build fails loudly.
 */

const fs = require('fs');
const path = require('path');
const codec = require('./codec');

const OUT = process.argv[2] || 'dist/TRACE_Platform.html';
const EM = '—';   // em dash
const EN = '–';   // en dash

/* ------------------------------------------------------------------ util */
let applied = 0;

function replaceOnce(text, find, repl, label) {
  const parts = text.split(find);
  if (parts.length !== 2) {
    throw new Error('patch "' + label + '": expected exactly 1 occurrence, found ' +
                    (parts.length - 1));
  }
  applied++;
  return parts[0] + repl + parts[1];
}

function removeOnce(text, find, label) {
  return replaceOnce(text, find, '', label);
}

/* ------------------------------------------------- 1. iOS light-only meta */
/**
 * The delivered file has no colour-scheme guards at all, so every document gets the
 * same five. They pin the UI to light on iOS, which is what the Look-Through and
 * Pricing surfaces are designed for; the Simulator keeps its own theme switch.
 */
function iosGuards(themeColor) {
  return '\n<meta name="color-scheme" content="light">' +
         '\n<meta name="supported-color-schemes" content="light">' +
         '\n<meta name="apple-mobile-web-app-capable" content="yes">' +
         '\n<meta name="apple-mobile-web-app-status-bar-style" content="default">' +
         '\n<meta name="theme-color" content="' + themeColor +
         '" media="(prefers-color-scheme: light)">';
}

/* ----------------------------------------------------- 2. em dash sweep */
/**
 * Zero em dashes, per the Definition of Done. Two contexts, two treatments:
 *   - a standalone glyph in a data slot (the "no value" placeholder) becomes an en
 *     dash, which keeps the accounting convention and is a different character;
 *   - in prose it becomes ordinary punctuation.
 * Numeric values are never touched: an em dash is not a digit.
 */
const PROSE_FIXES = [
  ['TRACE-Pro ' + EM + ' Apollo NAV Pricing', 'TRACE-Pro: Apollo NAV Pricing'],
  ['Hierarchy ' + EM + ' fund', 'Hierarchy: fund'],
  ['Lookthru TRACE Workbench', 'Lookthru TRACE Workbench']
];

function sweepEmDashes(text, label, report) {
  let out = text;

  // entities render identically, so fold them into the literal first
  out = out.replace(/&mdash;/gi, EM).replace(/&#8212;/g, EM).replace(/&#x2014;/gi, EM);

  for (const [from, to] of PROSE_FIXES) {
    if (out.indexOf(from) >= 0) out = out.split(from).join(to);
  }

  // placeholder: the glyph sits alone inside markup or quotes, with no spaces
  out = out.replace(new RegExp('>' + EM + '<', 'g'), '>' + EN + '<');
  out = out.replace(new RegExp('>' + EM + '(?=\\s*<)', 'g'), '>' + EN);
  out = out.replace(new RegExp('(["\'`])' + EM + '(["\'`])', 'g'), '$1' + EN + '$2');
  out = out.replace(new RegExp('>' + EM + '$', 'gm'), '>' + EN);

  // prose: spaced em dash becomes a comma, the safest universal substitute
  out = out.replace(new RegExp('\\s+' + EM + '\\s+', 'g'), ', ');
  // prose: leading or trailing glyph
  out = out.replace(new RegExp('^\\s*' + EM + '\\s*', 'gm'), '');
  out = out.replace(new RegExp('\\s*' + EM + '\\s*$', 'gm'), '');
  // anything left (glyph welded between characters) becomes a hyphen
  out = out.replace(new RegExp(EM, 'g'), '-');

  const left = (out.match(new RegExp(EM, 'g')) || []).length;
  report.push('  ' + label.padEnd(14) + (text.split(EM).length - 1) + ' literal + entities -> ' + left + ' remaining');
  if (left) throw new Error('em dash sweep left ' + left + ' in ' + label);
  return out;
}

/* ============================================================ TRACE-Pro */
function patchTracePro(src, assets) {
  let t = src;

  // --- external libraries -------------------------------------------------
  // d3 and SheetJS are only reachable from renderStructure/renderSim/exportExcel,
  // all of which are already guarded by `typeof d3 === 'undefined'` style checks,
  // so removing the tags changes nothing offline - which is the only way this file
  // is ever opened. It does remove two guaranteed console errors and two network
  // requests.
  t = removeOnce(t,
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>\n',
    'tracepro: drop xlsx CDN');
  t = removeOnce(t,
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>\n',
    'tracepro: drop d3 CDN');

  // --- iOS guards ---------------------------------------------------------
  t = replaceOnce(t,
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">' + iosGuards('#f6f1e7'),
    'tracepro: iOS guards');

  // --- phase 1 stylesheet -------------------------------------------------
  t = replaceOnce(t, '</style></head><body>',
    '</style>\n<style id="phase1-css">\n' + assets.css + '\n</style></head><body>',
    'tracepro: phase1 css');

  // --- bulk override panel, above the tree --------------------------------
  t = replaceOnce(t,
    '  <div class="recwrap">\n    <div class="rectable" id="lttablewrap">',
    assets.panel + '  <div class="recwrap">\n    <div class="rectable" id="lttablewrap">',
    'tracepro: bulk panel');

  // --- phase 1 behaviour, last classic script -----------------------------
  t = replaceOnce(t, '</script></body></html>',
    '</script>\n<script id="phase1-js">\n' + assets.js + '\n</script></body></html>',
    'tracepro: phase1 js');

  return t;
}

/* ================================================================ TRACE */
function patchTrace(src) {
  let t = src;

  t = removeOnce(t, '<link rel="preconnect" href="https://fonts.googleapis.com">\n',
    'trace: drop fonts preconnect 1');
  t = removeOnce(t, '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n',
    'trace: drop fonts preconnect 2');
  t = removeOnce(t,
    '<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Source+Serif+4:ital,opsz,wght@0,8..60,200..900;1,8..60,200..900&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">\n',
    'trace: drop google fonts');
  t = removeOnce(t, '<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>\n',
    'trace: drop d3 CDN');
  t = removeOnce(t, '<script src="https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js"></script>\n',
    'trace: drop sheetjs CDN');

  // The service probe fires a fetch on load. The product is offline-only, so the
  // automatic probe goes; TRACE.setService(...) still calls sfHealth() on demand.
  t = replaceOnce(t, '    sfHealth();\n  })();',
    '    /* no automatic service probe: this file is opened offline.\n' +
    '       TRACE.setService(url) still calls sfHealth() when a service is configured. */\n  })();',
    'trace: drop auto sfHealth');

  t = replaceOnce(t, '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' + iosGuards('#FAFAF7'),
    'trace: iOS guards');

  return t;
}

/* ================================================================ shell */
function patchShell(src) {
  return replaceOnce(src,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">' + iosGuards('#f6f1e7'),
    'shell: iOS guards');
}

/* ================================================================= main */
function main() {
  const assets = {
    css: fs.readFileSync('assets/tracepro-phase1.css', 'utf8').trim(),
    js: fs.readFileSync('assets/tracepro-phase1.js', 'utf8').trim(),
    panel: fs.readFileSync('assets/bulk-panel.html', 'utf8')
  };

  for (const [name, text] of Object.entries(assets)) {
    if (text.indexOf(EM) >= 0) throw new Error('asset ' + name + ' contains an em dash');
  }

  let shell = fs.readFileSync('src/shell.html', 'utf8');
  let trace = fs.readFileSync('src/mod_trace.html', 'utf8');
  let pro = fs.readFileSync('src/mod_tracepro.html', 'utf8');

  console.log('patching...');
  shell = patchShell(shell);
  trace = patchTrace(trace);
  pro = patchTracePro(pro, assets);
  console.log('  anchors applied: ' + applied);

  const report = [];
  console.log('em dash sweep:');
  shell = sweepEmDashes(shell, 'shell', report);
  trace = sweepEmDashes(trace, 'MOD_TRACE', report);
  pro = sweepEmDashes(pro, 'MOD_TRACEPRO', report);
  report.forEach(r => console.log(r));

  const out = codec.join(shell, { MOD_TRACE: trace, MOD_TRACEPRO: pro });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out);
  console.log('built ' + OUT + ' (' + Buffer.byteLength(out, 'utf8') + ' bytes)');
}

main();
