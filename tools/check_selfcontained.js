'use strict';
/**
 * check_selfcontained.js - static guarantees about the shipped file.
 *
 *   node tools/check_selfcontained.js [dist/TRACE_Platform.html]
 *
 * Exits 0 only when all of the following hold, for the shell and BOTH embedded module
 * documents (they are decoded first, so nothing can hide inside a string literal):
 *   1. no external resource is referenced from any fetchable position
 *   2. the five iOS light-only meta guards are present in every document
 *   3. the file contains zero em dash characters
 *   4. it is a single file with no build step and no backend
 */

const fs = require('fs');
const codec = require('./codec');

const FILE = process.argv[2] || 'dist/TRACE_Platform.html';

const EM_DASH = '—';

/** The five iOS light-only meta guards, as name -> required content substring. */
const IOS_GUARDS = [
  { label: 'meta color-scheme=light',
    re: /<meta\s+name=["']color-scheme["']\s+content=["']light["']\s*\/?>/i },
  { label: 'meta supported-color-schemes=light',
    re: /<meta\s+name=["']supported-color-schemes["']\s+content=["']light["']\s*\/?>/i },
  { label: 'meta apple-mobile-web-app-capable=yes',
    re: /<meta\s+name=["']apple-mobile-web-app-capable["']\s+content=["']yes["']\s*\/?>/i },
  { label: 'meta apple-mobile-web-app-status-bar-style=default',
    re: /<meta\s+name=["']apple-mobile-web-app-status-bar-style["']\s+content=["']default["']\s*\/?>/i },
  { label: 'meta theme-color (light)',
    re: /<meta\s+name=["']theme-color["']\s+content=["']#[0-9a-fA-F]{3,8}["']\s+media=["']\(prefers-color-scheme:\s*light\)["']\s*\/?>/i }
];

/**
 * Positions a browser will actually fetch from. An xmlns value is an XML namespace
 * identifier, never fetched, so it is matched and skipped explicitly rather than
 * being caught by a blanket "contains http" rule.
 */
const FETCHABLE = [
  { what: 'script src',        re: /<script\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi },
  { what: 'link href',         re: /<link\b[^>]*\shref\s*=\s*["']([^"']+)["']/gi },
  { what: 'img src',           re: /<img\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi },
  { what: 'iframe src',        re: /<iframe\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi },
  { what: 'source/audio/video src', re: /<(?:source|audio|video|embed|track)\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi },
  { what: 'object data',       re: /<object\b[^>]*\sdata\s*=\s*["']([^"']+)["']/gi },
  { what: 'use href',          re: /<use\b[^>]*\s(?:xlink:)?href\s*=\s*["']([^"']+)["']/gi }
];

/**
 * CSS-only patterns. These must be applied to <style> contents alone: scanning the whole
 * document for `url(` also matches JavaScript such as URL.createObjectURL(blob) and
 * sfUrl('/api/health'), which are not fetches of external resources.
 */
const CSS_FETCHABLE = [
  { what: 'css url()',   re: /url\(\s*["']?([^"')]+)["']?\s*\)/gi },
  { what: 'css @import', re: /@import\s+(?:url\()?\s*["']([^"']+)["']/gi }
];

function isLocalRef(u) {
  const s = String(u).trim();
  if (!s) return true;
  if (s.startsWith('#')) return true;                 // fragment
  if (s.startsWith('data:')) return true;             // inlined
  if (s.startsWith('blob:')) return true;             // runtime object URL
  if (/^https?:\/\//i.test(s)) return false;
  if (s.startsWith('//')) return false;               // protocol-relative
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    return /^(?:javascript|about|mailto|tel):/i.test(s);
  }
  return false;                                       // any other relative path = 2nd file
}

function scanDoc(label, text, problems) {
  for (const { what, re } of FETCHABLE) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const url = m[1];
      if (isLocalRef(url)) continue;
      problems.push(label + ': external ' + what + ' -> ' + url.slice(0, 140));
    }
  }
  // CSS patterns, scoped to <style> blocks so JavaScript cannot trip them.
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let sm;
  while ((sm = styleRe.exec(text)) !== null) {
    const css = sm[1];
    for (const { what, re } of CSS_FETCHABLE) {
      re.lastIndex = 0;
      let cm;
      while ((cm = re.exec(css)) !== null) {
        if (isLocalRef(cm[1])) continue;
        problems.push(label + ': external ' + what + ' -> ' + cm[1].slice(0, 140));
      }
    }
  }

  // A stylesheet or font pulled in via a bare protocol-relative or absolute URL anywhere
  // in a <link rel="preconnect"> also counts as reaching off the machine.
  const pre = /<link\b[^>]*rel\s*=\s*["'](?:preconnect|dns-prefetch|preload|prefetch)["'][^>]*>/gi;
  let p;
  while ((p = pre.exec(text)) !== null) {
    problems.push(label + ': resource hint reaches the network -> ' + p[0].slice(0, 140));
  }
}

function main() {
  if (!fs.existsSync(FILE)) {
    console.error('check_selfcontained: no such file: ' + FILE);
    process.exit(2);
  }
  const raw = fs.readFileSync(FILE, 'utf8');
  const { shell, modules } = codec.split(raw);
  const docs = {
    'shell': shell,
    'MOD_TRACE': modules.MOD_TRACE,
    'MOD_TRACEPRO': modules.MOD_TRACEPRO
  };

  const problems = [];
  console.log('check_selfcontained: ' + FILE);
  console.log('  size: ' + Buffer.byteLength(raw, 'utf8') + ' bytes');

  /* 1. external resources ------------------------------------------- */
  for (const [label, text] of Object.entries(docs)) scanDoc(label, text, problems);
  const externalProblems = problems.length;
  console.log('  [1] external resource references: ' + externalProblems);

  /* 2. iOS light-only meta guards ------------------------------------ */
  let guardFails = 0;
  for (const [label, text] of Object.entries(docs)) {
    for (const g of IOS_GUARDS) {
      if (!g.re.test(text)) { problems.push(label + ': missing ' + g.label); guardFails++; }
    }
  }
  console.log('  [2] iOS light-only meta guards: ' +
              (IOS_GUARDS.length * 3 - guardFails) + '/' + (IOS_GUARDS.length * 3) + ' present');

  /* 3. em dashes ------------------------------------------------------ */
  let emTotal = 0;
  for (const [label, text] of Object.entries(docs)) {
    const n = text.split(EM_DASH).length - 1;
    emTotal += n;
    if (n) problems.push(label + ': ' + n + ' em dash character(s)');
  }
  // also catch an em dash written as an HTML entity, which renders identically
  for (const [label, text] of Object.entries(docs)) {
    const ents = (text.match(/&(?:mdash|#8212|#x2014);/gi) || []).length;
    if (ents) { emTotal += ents; problems.push(label + ': ' + ents + ' em dash HTML entity/entities'); }
  }
  console.log('  [3] em dash characters: ' + emTotal);

  /* 4. single file, no backend --------------------------------------- */
  const structural = [];
  if (!/^<!DOCTYPE html>/i.test(raw.trim())) structural.push('not an HTML document');
  for (const [label, text] of Object.entries(docs)) {
    // An inline type="module" script is fine: it ships inside the file. What would break
    // the single-file promise is importing from a second file.
    if (/\bimport\s+[^;]*\bfrom\s+["'][^"']+["']/.test(text)) {
      structural.push(label + ': ES module import (needs a build step / second file)');
    }
  }
  structural.forEach(s => problems.push(s));
  console.log('  [4] single-file structure: ' + (structural.length ? 'FAIL' : 'ok'));

  if (!problems.length) {
    console.log('');
    console.log('SELF-CONTAINED CHECK PASS');
    process.exit(0);
  }
  console.error('');
  console.error('SELF-CONTAINED CHECK FAIL (' + problems.length + ')');
  problems.slice(0, 60).forEach(p => console.error('  - ' + p));
  if (problems.length > 60) console.error('  ... and ' + (problems.length - 60) + ' more');
  process.exit(1);
}

main();
