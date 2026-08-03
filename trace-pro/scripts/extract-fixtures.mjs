/**
 * Lift the five embedded data blobs out of the original and write them as runtime fixtures.
 *
 *   node scripts/extract-fixtures.mjs [--check]
 *
 * The blobs live as `const` declarations on two lines of the original's script block:
 *   line 880  -> EMB, UNI, PRICING, REVBASE   (599,466 chars)
 *   line 1556 -> SIM                          ( 32,448 chars)
 *
 * They are evaluated in a node:vm context and serialised with JSON.stringify. `--check`
 * re-reads what is on disk and asserts deep equality against the original, so a fixture can
 * never silently drift from the artifact it came from. That check runs in the gate.
 *
 * Fixtures are copied faithfully INCLUDING the fields nothing reads (EMB.recon, dcN, resid,
 * apexPos, grandVar, 7 PRICING fields, 5 REC fields, UNI.counts, two maxlevel). They are data
 * of record; see docs/redesign-spec.md Q2.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGINAL = path.join(ROOT, 'reference/TRACE-Pro-original.html');
const CHECK = process.argv.includes('--check');

/** Blob name -> output file, and which fixture directory it belongs to. */
const FILES = {
  EMB: 'lookthrough.json',
  UNI: 'universe.json',
  PRICING: 'legacy-pricing.json',
  REVBASE: 'repricing.json',
  SIM: 'simulator.json',
};

function readBlobs() {
  const lines = fs.readFileSync(ORIGINAL, 'utf8').split('\n');
  const ctx = {};
  vm.createContext(ctx);
  // lines[879] declares EMB/UNI/PRICING/REVBASE; lines[1555] declares SIM.
  vm.runInContext(
    lines[879] + '\n' + lines[1555] + '\nglobalThis.__blobs={EMB,UNI,PRICING,REVBASE,SIM};',
    ctx,
    { timeout: 30000 }
  );
  return ctx.__blobs;
}

const blobs = readBlobs();

const slug = String(blobs.EMB.product)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');
const asof = String(blobs.EMB.asof);
const dir = path.join(ROOT, 'data', slug, asof);

if (CHECK) {
  let bad = 0;
  for (const [name, file] of Object.entries(FILES)) {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) {
      console.error(`MISSING fixture: ${path.relative(ROOT, p)}`);
      bad++;
      continue;
    }
    const onDisk = JSON.parse(fs.readFileSync(p, 'utf8'));
    try {
      assert.deepEqual(onDisk, JSON.parse(JSON.stringify(blobs[name])));
      console.log(`ok  ${file} matches ${name} in the original`);
    } catch {
      console.error(`DRIFT ${file} no longer matches ${name} in the original`);
      bad++;
    }
  }
  const manifestPath = path.join(ROOT, 'data/manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('MISSING data/manifest.json');
    bad++;
  }
  console.log(bad ? `\nFIXTURE CHECK FAILED (${bad})` : '\nFIXTURE CHECK PASSED');
  process.exit(bad ? 1 : 0);
}

fs.mkdirSync(dir, { recursive: true });
let total = 0;
for (const [name, file] of Object.entries(FILES)) {
  const json = JSON.stringify(blobs[name]);
  fs.writeFileSync(path.join(dir, file), json + '\n');
  total += json.length;
  console.log(`${file.padEnd(22)} ${(json.length / 1024).toFixed(1).padStart(7)} KiB   (was ${name})`);
}

const manifest = {
  $comment:
    'Products and as-of dates available to the app. Selected via ?product=<slug>&asof=<date>; ' +
    'the first entry is the default. Adding a product means dropping a folder here and adding a line.',
  default: { product: slug, asof },
  products: [
    {
      slug,
      name: blobs.EMB.product,
      code: blobs.REVBASE.productCode,
      asOfDates: [asof],
      // The position the Ownership lens opens on. The original hard-coded
      // renderBreakout('APPOURI') at line 2498; it belongs to the firm-wide universe rather than
      // this product's look-through tree, so it cannot be derived and must be declared.
      defaultPosition: 'APPOURI',
      files: FILES,
    },
  ],
};
fs.writeFileSync(path.join(ROOT, 'data/manifest.json'), JSON.stringify(manifest, null, 1) + '\n');

fs.writeFileSync(
  path.join(ROOT, 'data/README.md'),
  `# Fixtures

Extracted from \`reference/TRACE-Pro-original.html\` by \`scripts/extract-fixtures.mjs\`.
Re-verify with \`npm run fixtures:check\` — it asserts deep equality against the original, so
these files cannot drift from the artifact they came from.

| File | Was | Contents |
|---|---|---|
| \`lookthrough.json\` | \`EMB\` | 149 look-through tree nodes, product headline |
| \`universe.json\` | \`UNI\` | firm-wide ownership graph: 1,382 edges, 710 entities, 2,500 search rows, 1,986 ultimates, 5 issue buckets |
| \`repricing.json\` | \`REVBASE\` | 26 funds with NAV / revised / derived / global-units maps, 3 apex, 6 breaks |
| \`simulator.json\` | \`SIM\` | 26 funds, 33 edges, 27 tree nodes, 14 breaks |
| \`legacy-pricing.json\` | \`PRICING\` | legacy recon model; supplies warnBps/badBps/product/ltvByCode only |

## Fields nothing reads

Copied faithfully anyway, because they are data of record (see \`docs/redesign-spec.md\` Q2):
\`EMB.recon\` (23 rows), \`EMB.dcN\`, \`EMB.resid\`, \`EMB.bps\`, \`EMB.apexPos\`, \`EMB.grandVar\`,
\`PRICING.lookthroughNAV\`, \`.derivedTotal\`, \`.positionTotal\`, \`.repricingPnL\`,
\`.priceableCount\`, \`.missingNav\`, \`.fxFunds\`, \`PRICING.recon.grossNonTrade\`, \`.grossLT\`,
\`.net\`, \`.apexNAV\`, \`.productName\`, \`UNI.counts\`, \`REVBASE.maxlevel\`, \`SIM.maxlevel\`.

## Two product NAVs

\`lookthrough.json\`.\`prodNAV\` = 2062196050.07 (fund-entity NAV stamp) and
\`repricing.json\`.\`N\` = 2062198835.86 (Σ apex ENDING_NAV) differ by 2785.79, which is exactly the
DUNK feeder's NAV. Both are preserved and both are displayed, labelled by basis. See spec §1.8.1.
`
);

console.log(`\ntotal ${(total / 1024).toFixed(1)} KiB across ${Object.keys(FILES).length} fixtures`);
console.log(`wrote data/${slug}/${asof}/ + data/manifest.json + data/README.md`);
