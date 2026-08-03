import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

// The FULL denylist from docs/ux-rubric.md R2.
const CASE_SENSITIVE = ['MV', 'LTV', 'NAV', 'SPV', 'VPM', 'FR', 'DC', 'Δ'];
const LOWER = ['lt', 'rfx', 'str', 'sim', 'iss', 'own', 'gls', 'px', 'qty', 'gq', 'apex', 'nonav', 'mv100', 'dcN'];
const PHRASES = ['in tol', 'scen a', 'scen b'];

const EXPANSIONS = {
  NAV: /net asset value/i,
  SPV: /special purpose vehicle/i,
  VPM: /(vpm\s*[—:(-]\s*)?(the firm'?s )?(valuation|virtual) portfolio/i,
  MV: /market value/i,
  bps: /basis points/i,
  LTV: /look-?through value/i,
  DC: /double[- ]count/i,
  FR: /(fund reporting|financial report)/i,
  apex: /top-level feeder/i,
};

const out = {};
for (const [route, blob] of Object.entries(d)) {
  const texts = [...blob.masthead, ...blob.screen].filter((x) => x.vis).map((x) => x.t);
  const all = texts.concat(blob.svgText ?? []);
  const joined = all.join('  ||  ');
  const findings = [];
  const push = (token, ctxs, mode) => {
    if (!ctxs.length) return;
    const exp = EXPANSIONS[token];
    findings.push({
      token,
      mode,
      occurrences: ctxs.length,
      expandedOnScreen: exp ? exp.test(joined) : null,
      firstContexts: ctxs.slice(0, 5),
    });
  };
  for (const t of CASE_SENSITIVE.concat(['bps'])) {
    const re = t === 'Δ' ? /Δ/ : new RegExp(`(^|[^A-Za-z0-9])${t}([^A-Za-z0-9]|$)`);
    push(t, all.filter((x) => re.test(x)), 'whole-word, case-sensitive');
  }
  for (const t of LOWER) {
    const re = new RegExp(`(^|[^A-Za-z0-9])${t}([^A-Za-z0-9]|$)`, 'i');
    push(t, all.filter((x) => re.test(x)), 'whole-word, case-insensitive');
  }
  for (const t of PHRASES) {
    push(t, all.filter((x) => x.toLowerCase().includes(t)), 'substring');
  }
  out[route] = findings;
}
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
for (const [route, f] of Object.entries(out)) {
  console.log('=== ' + route);
  for (const x of f) {
    console.log(
      `  ${x.token.padEnd(6)} n=${String(x.occurrences).padStart(3)} expanded=${x.expandedOnScreen}  e.g. ${JSON.stringify(x.firstContexts[0]).slice(0, 110)}`
    );
  }
}
