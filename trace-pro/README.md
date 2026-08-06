# TRACE-Pro

NAV pricing and look-through for Apollo fund products. A fund controller opens it to answer three
questions in order: *does the NAV tie, what price do I publish, and why is this fund off?* It runs
entirely in the browser, reads its figures from JSON on its own origin, and can also recompute every
figure from a NAV or position report the controller drops into it.

It is a rebuild of a **934 KB single-file HTML application** — `reference/TRACE-Pro-original.html`,
934,142 bytes, 2,520 lines, with its data welded in as literals (614.5 KiB of it once extracted into
`data/`) — as a multi-file TypeScript application, under one hard promise: **not one figure it
reports may change.**

## Status, stated plainly

The **four mechanical gates pass.** Measured on this working tree; all four in one command is
`npm run gate`, which exits 0:

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint + structure + fixtures | `npm run lint` | exit 0 |
| Unit tests | `npx vitest run` | 156 passed / 156, 9 files |
| Headless suite | `npm run test:e2e` | 117 passed / 117 (`app` + `offline` projects) |
| Semantic parity | `npm run gate:parity` | **1020 / 1020 keys over 22 scenes · 978 strict · 42 declared-label · 0 digit violations · 0 diffs**, and 0 console errors, 0 off-origin requests |

**The fifth sub-gate is a person, and it does not pass.** An independent critic grades the 18
criteria in the frozen `docs/ux-rubric.md`, and **R17 is an accepted, documented FAIL**: the frozen
rubric and the frozen baseline contradict each other and cannot both be satisfied. R17 asks for one
documented precision rule per quantity class, "bps 1dp, applied everywhere". `tests/baseline.json`
pins the *same* computed quantity at two precisions — `pricing.fund.ASCHON.pnl_bps` = `"2"` and
`pricing.walk.fund.ASCHON.delta_bps` = `"+1.9"`, both **strict** byte-compared keys — so rendering
either at the other's precision changes a digit and fails PARITY. The analysis, the three options and
the recommendation are in [`docs/halt-r17.md`](docs/halt-r17.md); **no frozen file was amended to
make this go away.** What was done without needing a decision: the four places that had
independently decided that precision became one, in `src/domain/money.ts`, with two named exceptions
that each cite the strict keys forcing them. No rendered string changed.

**Nothing here claims 18/18, and nothing here claims 17/18 either.** The last independent pass
([`docs/ux-scorecard-2.md`](docs/ux-scorecard-2.md)) graded commit `c354df9` at 15 PASS / 3 FAIL
(R2, R4, R17); R2 and R4 were then fixed in `ccb2a6e` and `1ec51bb` and are covered by
`tests/e2e/rubric-vocabulary*.spec.ts` and `tests/e2e/states-*.spec.ts`, which pass. R17 was not, and
cannot be. No critic has re-graded the current tree. `docs/ledger.md` is the live build state; where
it and this README disagree about *progress*, the ledger is the record.

## What each screen answers

Six routes. Each one paints its question as the first text in its content region — the strings below
were read out of the running build, not copied from source comments. The four Diagnose lenses also
carry the Diagnose screen's own question above their own.

| Route | The question on screen | What a controller is actually doing |
|---|---|---|
| `#/reconciliation` *(landing)* | "Does this product’s NAV agree with the value of what it holds, and where is the difference?" | Signing off the NAV. I need to see that it ties, and if it does not, whether the gap is pricing or cash and fees — before I look at a single fund. |
| `#/pricing` | "What unit price do I publish for each fund today, and what does repricing do to value?" | Producing today's price file. One row per fund — 26 of them — with the price to publish at six decimal places (or an em dash where the fund reports no NAV to divide), and the total that repricing adds to or takes off the book. |
| `#/diagnose/structure` | "How is this product wired — who owns whom, and where is concentration?" | Finding out what I am even looking at. Which feeders sit under the product, how deep it goes, and where the value is piled up. |
| `#/diagnose/ownership` | "Who ultimately owns this position, and in what proportion?" | Proving a position's owners add up to 100% — and naming them when they do not, because that is a break I have to explain. |
| `#/diagnose/data-quality` | "What is wrong with the source data before I trust any figure above?" | Deciding how much of this I can sign. 105 defects in five buckets, with severities, so I know whether a figure rests on a self-mapping fund or a dangling SPV code. |
| `#/diagnose/simulator` | "If this fund’s value or units move, what happens to product NAV, and through which holders?" | Answering "what if" before someone asks it in a meeting. Move one fund, watch product NAV move, and see which holders carried it. |

Diagnose is **one selected entity seen four ways**. Switching lens never clears the selection, which
is the point: suspecting a fund once must not cost four searches. The original's seven cryptic tabs
(`lt rfx str sim iss own gls`) became these six routes plus the Glossary drawer, and its fold-away
provenance strip became the second drawer; nothing was deleted. The inventory and the reasoning are in
[`docs/redesign-spec.md`](docs/redesign-spec.md).

Two drawers are one action from every screen:

- **Glossary** (`Glossary` in the masthead, or the `G` key) — 35 terms, the definition layer behind
  every label. Any glossary-linked term on a screen opens the drawer at that term.
- **Data sources & as-of** (`Data sources`) — which report each figure came from, as of when, and
  **the two upload slots**.

What a first-run reader must see on each route without scrolling or clicking is named in advance in
[`docs/first-run.md`](docs/first-run.md).

## Uploading a report

The shipped figures come from an extract of the original. A controller with a fresher report does not
have to wait for a rebuild: the **Data sources & as-of** drawer carries two live file inputs, and
choosing a file recomputes the app in place.

**The file never leaves the browser.** There is exactly one `fetch()` in the whole application
(`src/data/load.ts`), it only ever requests `data/*.json` from the app's own origin, and `src/`
contains no `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `FormData` or `EventSource`. An uploaded
file is read with `File.text()` or `File.arrayBuffer()`; a workbook is parsed by
`vendor/xlsx.full.min.js`, loaded from disk. There is no backend to send it to.

| Slot | Accepts | Columns it reads | What recomputes |
|---|---|---|---|
| **Position Report** | `.xlsx`, `.xls`, `.csv` | Requires Fund Code, SPV Fund Code, Quantity VPM, MV USD. Also reads Fund Entity, Fund, Security Code, Security, Issuer and NAV End USD when present. | **Structure and values together.** The hierarchy is rebuilt from the file and then repriced from it: the reconciliation waterfall, the tree, the Structure graph, every price to publish and the repricing walk. |
| **NAV Report** | `.csv`, `.xlsx`, `.xls` | Requires a fund-code column plus this period's `ENDING_NAV` — either the pivot layout (`PRODUCT`, `FUND_CODE`, `ENDING_NAV`) or a per-fund feed. | **Values only.** The book is repriced bottom-up from the uploaded net asset values; the structure is left exactly as it is. |

Both slots refuse rather than guess, and say what they wanted. Fund Entity is required in practice
even though it is not one of the four columns the reader demands: a row's entity must name the product
on screen, or the slot refuses.

- A **Position Report dropped in the NAV slot** is named as such and pointed at the right slot,
  instead of reading nothing.
- A `PREV_DAY_ENDING_NAV` or opening-NAV column is **ignored**, not mistaken for this period's.
- A fund code appearing **twice with different NAVs** is refused by name and row, because
  first-value-wins would have published a price off whichever row the export wrote first.
- A **NAV cell holding text** is refused; blank and `#N/A` are read as "no NAV", which is different.
- A **report for another product** is refused. The original silently fell back to the first fund
  entity in the file, so a colleague's report could replace every figure under your product's name.
- A **truncated row** is refused instead of landing as a row of zeros.

Every refusal leaves the figures on screen untouched, offers "Choose a different file", and each slot
has real loading, empty and error states scoped to itself (R4); the reader is chunked and yields, so
that loading state is visible on a large file rather than theoretical.

Measured, not asserted: `tests/e2e/states-upload.spec.ts` uploads a NAV report generated from the
shipped fixtures with every fund lifted 1%, and the published NAV moves `$2,062,198,836` →
`$2,082,820,824`; re-uploading the same book as a per-fund feed carrying a `PREV_DAY_ENDING_NAV` trap
column in front of the real one lands back on `$2,062,198,836` to the cent. A position report rebuilds
the tree the Reconciliation screen draws. `tests/unit/ingest*.spec.ts` holds 42 unit tests over the
readers, including a round trip that regenerates a report from the fixtures and gets the models back.

Two honest limits. The **Ownership** and **Data quality** lenses read the firm-wide `universe.json`,
which is not a per-product report and is *not* replaced by either upload. And an upload is a session,
not a save: there is nothing to write to, so a reload returns to the shipped extract. The parity
harness never uploads, so the frozen figures are what it grades.

## The file tree — one line per directory, saying what it owns

```text
trace-pro/
├── index.html                  shell only: <div id="app"> and a loading state. No data, no logic.
├── package.json                every supported command; nothing outside these scripts is one
├── vite.config.ts              serves data/ and vendor/ from the repo root; copies both into dist/
├── tsconfig.json  eslint.config.js  vitest.config.ts  playwright.config.ts
│
├── src/
│   ├── main.ts                 boot: URL → product + as-of → fixtures → state → shell → screen. A
│   │                           fixture failure becomes an error state AND re-throws, never silence.
│   ├── domain/                 ── THE MATH. Pure: no DOM, no state, no fetch. Unit-tested. ──
│   │   ├── types.ts            fixture and model shapes; field names are the original's
│   │   ├── money.ts            every formatter, one per quantity class (docs/labels.md)
│   │   ├── lookthrough.ts      the three values per node — look-through / repriced / NAV — and the tree
│   │   ├── repricing.ts        bottom-up repricing: terminal price = NAV ÷ units, rolled upward
│   │   ├── repricing-positions.ts  the same recompute, driven from an uploaded position index
│   │   ├── ownership.ts        effective shares by fixed point, so cross-holdings and cycles resolve
│   │   ├── cascade.ts          shock propagation and the staged reprice, one topological pass
│   │   ├── reconciliation.ts   the additive waterfall, the per-driver bridge, the tie check
│   │   ├── exceptions.ts       ONE definition of the $250k / 50 bps materiality rule and the bps bands
│   │   └── ingest/             ── READING AN UPLOADED REPORT. Pure; rows in, models out. ──
│   │       cells.ts (CSV, and what an accountant means by (1,234.50), $, #N/A, —) ·
│   │       nav-report.ts (fund code → this period's ENDING_NAV) · position-report.ts (rows →
│   │       the look-through hierarchy). Each names every refusal rather than reading zeros.
│   ├── state/store.ts          the only mutable state and the only thing that notifies: product,
│   │                           as-of, screen, lens, pricing basis, the selectedEntity the four
│   │                           lenses share, and the model swap an upload performs
│   ├── data/load.ts            fixture fetching: manifest, URL → selection, core bundle, and the
│   │                           lazily-loaded 472 KiB ownership universe
│   ├── export/                 the only code that builds a file: csv.ts · excel.ts (vendored SheetJS)
│   ├── ui/                     ── RENDERING ONLY. Reads state, calls domain, computes no figure. ──
│   │   ├── chrome/shell.ts     masthead, never-collapsible as-of badge, pricing-basis control, nav
│   │   ├── parity.ts           tags each rendered figure with its semantic parity key
│   │   ├── primitives/         dom.ts (addEventListener only; keyboard-activates anything clickable)
│   │   │                       · combobox.ts · term.ts (a label wired to its glossary definition)
│   │   ├── screens/            reconciliation/ · pricing/ · diagnose/{structure,ownership,
│   │   │                       data-quality,simulator}/ — one folder per route
│   │   ├── drawers/            glossary.ts · glossary-card.ts · sources.ts · sources-upload.ts
│   │   │                       (the two working upload slots live here)
│   │   └── styles/             app.css (design tokens first) · components.css (shared components)
│   │                           · lenses.css (the Diagnose lens visuals) · glossary-terms.css
│   └── glossary/               the 35 terms as data, split into six section modules
│
├── data/                       ── FIXTURES. Fetched at runtime; never imported. ──
│   ├── manifest.json           products × as-of dates, the default, and each product's opening position
│   ├── README.md               what each file was called in the original, and every dead field
│   └── apollo-sports-capital/2026-06-30/
│       ├── lookthrough.json    was EMB      · 149 tree nodes            49.6 KiB
│       ├── universe.json       was UNI      · firm-wide ownership graph 472.5 KiB (lazy)
│       ├── repricing.json      was REVBASE  · the authoritative recon    31.3 KiB
│       ├── simulator.json      was SIM                                   31.4 KiB
│       └── legacy-pricing.json was PRICING  · legacy model, mostly dead  29.6 KiB
│
├── vendor/                     committed, offline: xlsx.full.min.js 0.18.5 · d3.min.js 7.8.5
│
├── reference/                  the originals, read-only. TRACE-Pro-original.html is FROZEN and
│                               git-enforced; the sibling and shell files are context only.
│
├── parity-map.json             FROZEN. 1,020 semantic keys → where each figure lives in the
│                               ORIGINAL. Keyed on meaning, never on DOM position.
├── tests/
│   ├── baseline.json           FROZEN evidence: those 1,020 figures as the original rendered them
│   ├── unit/                   the domain modules under Vitest — ownership solve, look-through walk,
│   │                           repricing cascade, reconciliation bridge, materiality rules, both
│   │                           ingest readers and their refusals, plus a differential test against
│   │                           the original's own ownership algorithm
│   └── e2e/                    the headless suite (Playwright) — every route renders, the rubric
│                               checks (R1 paint order, R2 vocabulary, R5 above the fold, R6 focus),
│                               every panel's and both upload slots' loading/empty/error states, the
│                               exports, and the offline project
│
├── scripts/
│   ├── snapshot.mjs            THE PARITY HARNESS. Captures or diffs the 1,020 keys.
│   ├── check-frozen.mjs        proves the four frozen files were never amended, from git history
│   ├── check-limits.mjs        400-line cap, data literals, duplicate identifiers, inline on*=, !important
│   ├── check-issues.mjs        fails if an inventoried defect is missing from docs/issues.md, or
│   │                           dispositioned with a claim the repository contradicts
│   ├── extract-fixtures.mjs    extracts data/ from the original, and re-verifies it (--check)
│   ├── classify-keys.mjs       derives which baseline keys carry a retired label and checks
│   │                           docs/rename-map.json against that set, key for key
│   ├── evidence-pack.mjs       runs every sub-gate, saves each output verbatim (stamped with the
│   │                           git HEAD it was captured at), and assembles docs/evidence/PHASE3.md
│   │                           from the exit codes it collected. --reuse refuses to assemble from
│   │                           logs stamped at another commit unless --allow-stale is passed
│   ├── audit-ownership.mjs     names the entities whose ownership does not conserve
│   ├── probe.mjs  smoke.mjs    authoring aids, not gates
│   └── lib/                    server.mjs (static server) · browser.mjs (pinned browser context) ·
│                               parity.mjs · extract.mjs · steps.mjs · md.mjs (pack markdown, incl.
│                               the verbatim fence) · scorecards.mjs (discovers every
│                               docs/ux-scorecard*.md; newest by git commit date drives the verdict)
│
└── docs/                       ── THE PAPER TRAIL. Every claim in here is checkable. ──
    ├── ux-rubric.md            FROZEN. The 18 criteria this is graded against.
    ├── ledger.md               what is built, and what the gate reports. Read this first.
    ├── halt-r17.md             why R17 cannot pass on this baseline, and the three options
    ├── redesign-spec.md        the 7-tab inventory, the IA decision, the rename table, the module
    │                           and data plans, and 8 open questions with resolutions
    ├── rename-map.json         per key, the exact string the rebuild must render where the
    │                           vocabulary changed — with a guard that every digit survives
    ├── issues.md               every defect found in the original, resolved or carried
    ├── labels.md               label → quantity, and the precision rule per quantity class
    ├── first-run.md            the primary answer named in advance, per screen and lens
    ├── exceptions.md           the allowlist check-limits.mjs reads for inline on*= and
    │                           !important — currently empty, its strongest possible state
    ├── ux-scorecard.md · ux-scorecard-2.md   two independent critic passes, as graded
    ├── vocabulary-todo.md · parity-map.schema.md · loop-prompt.md   working notes
    └── evidence/               screenshots and machine output cited by the rubric, plus
                                gate/*.txt — the verbatim output of each sub-gate
```

`domain/` owns every number and knows nothing about screens. `state/` owns what is selected and
notifies. `ui/` owns pixels and may not compute a figure — if a component needs a number it asks the
domain. Fixtures are fetched, never imported, so no source file carries a data literal. Those
boundaries are enforced by `scripts/check-limits.mjs`: no source file over 400 lines, no data literal
over 2,000 characters, no identifier declared at top level in two modules (565 in `src/`, all unique).

## How to run it

Toolchain from `package.json`: Vite 8.2.0 · TypeScript 6.0.3 · Vitest 4.1.10 · ESLint 10.8.0 ·
Playwright 1.56.1. No `engines` floor is declared; built and run here on Node `v22.22.2`. The app
itself has **zero runtime dependencies**.

```bash
npm install
npm run dev          # dev server on http://localhost:5178/ — serves data/ and vendor/ too
npm run build        # production build into dist/, with data/ and vendor/ copied alongside
npm run preview      # serve the built dist/ exactly as it will ship (http://localhost:4173/)
npm test             # the unit suite — 156 tests over the pure domain modules
npm run test:e2e     # the headless suite; it BUILDS first, then serves dist/ on 4178
```

The full four-gate command is one script:

```bash
npm run gate         # gate:static → test → test:e2e → gate:parity
```

`npm run gate:static` is `build` + `typecheck` + `lint` + `keys:classify`, and `npm run lint` is
`eslint .` followed by `check-frozen` → `check-limits` → `check-issues` → `extract-fixtures --check`
→ `classify-keys`. The parity gate reads `dist/`, which is gitignored, so it needs a build first —
which is why `gate:static` runs before it in the chain. On its own:

```bash
npm run build && node scripts/snapshot.mjs --target dist/ --diff tests/baseline.json --expect-renamed
```

Everything else that exists, in `package.json` order: `dev`, `build`, `preview`, `typecheck`, `lint`,
`test`, `fixtures:extract`, `fixtures:check`, `snapshot:original`, `keys:classify`, `gate:parity`,
`gate:parity:original`, `gate:static`, `gate`, `test:e2e`, `test:e2e:app`, `test:e2e:offline`,
`evidence`, `check:frozen`. Nothing outside that list is a supported command. `npm run evidence` runs
every sub-gate and writes `docs/evidence/PHASE3.md` plus the verbatim logs in `docs/evidence/gate/` —
a red pack is the deliverable when the gate is red, and there is no flag to force a pass.
`npm run check:frozen` alone re-proves the four frozen files from git history.

## Pointing it at a different product or as-of date

Both come from the **query string**, resolved against `data/manifest.json` by `resolveSelection()`
in `src/data/load.ts`. The screen and lens are separate, and live in the **hash**:

```
http://localhost:5178/?product=apollo-sports-capital&asof=2026-06-30#/pricing
```

- `product` is a **slug** matching a `products[].slug` in the manifest. An unknown slug falls back
  to the entry named by `default.product`.
- `asof` must appear in that product's `asOfDates`. An unknown date falls back to that product's
  **first** `asOfDates` entry.
- Neither given → `default.product` and `default.asof`. Today that is `apollo-sports-capital` /
  `2026-06-30`, which is the only product in the manifest.

Verified in the built app: `?product=not-a-product` and `?asof=1999-01-01` both land on Apollo
Sports Capital / 2026-06-30 with the shipped NAV and no console error, rather than failing.

Fixtures are then fetched from `data/<slug>/<as-of>/`. **Adding a product is a data change, not a
code change:**

1. Create `data/<your-slug>/<YYYY-MM-DD>/` and drop in the five files. **The five filenames are
   fixed by `src/data/load.ts` and must be exactly** `lookthrough.json`, `repricing.json`,
   `simulator.json`, `legacy-pricing.json` and `universe.json` — `loadCore()` and
   `createUniverseLoader()` build those paths literally. The field names inside them are the
   original's and are the on-disk contract (`src/domain/types.ts`).
2. Add one entry to `data/manifest.json`: `slug`, `name` (what the masthead shows), `code` (the
   short product code), `asOfDates`, and `defaultPosition` — the universe position the Ownership
   lens opens on, which cannot be derived and so must be declared. All five are read by
   `resolveSelection()` / `createStore()`.
3. Reload with `?product=<your-slug>`. Nothing is rebuilt and no constant is edited.

A second as-of date for an existing product is step 1 plus appending to that product's `asOfDates`.

One correction to an easy misreading: each manifest entry also carries a **`files` map**
(`EMB → lookthrough.json`, `UNI → universe.json`, …). Nothing in `src/` reads it. It is written by
`scripts/extract-fixtures.mjs` as provenance — which blob in the original became which file — and
renaming a file there does **not** change where the app looks. Do not rely on it to repoint
anything.

Two things worth knowing before you do it. The 472 KiB `universe.json` is fetched lazily, on first
use, with a real loading state — only the Ownership and Data-quality lenses need it, so the other
four routes never pay for it. And **the app never reads a clock**:

```bash
grep -rnE 'new Date|Date\.now|Math\.random|performance\.now' src/   # no matches
```

`asof` is a data field, in the original and in the rebuild. Every rendered figure is a pure function
of the fixtures, which is what makes byte-identical snapshots possible at all.

## The verification gate

| Sub-gate | Command | What must be true |
|---|---|---|
| **STATIC** | `npm run gate:static` | `vite build` 0 · `tsc --noEmit` 0 · `eslint .` 0 · frozen-file check 0 · `check-limits` 0 (no file > 400 lines, no data literal > 2,000 chars, no duplicate top-level identifier, zero inline `on*=`, zero `!important`) · issue-register check 0 · `extract-fixtures --check` 0 · `classify-keys` 0 |
| **UNIT** | `npm test` | every `tests/unit/` spec passes, with direct tests for the ownership solve, the look-through walk, the repricing cascade, the reconciliation bridge and both ingest readers |
| **E2E** | `npm run test:e2e` | both projects pass; it builds first, so the suite can never grade a stale bundle. `test:e2e:app` is the functional and rubric half, `test:e2e:offline` re-runs with every off-origin request aborted |
| **PARITY** | `npm run gate:parity` | zero value diffs against `tests/baseline.json` and zero unresolved keys. Exit 1 = a key could not be resolved, or a capture scene errored; exit 2 = a figure changed; exit 3 = the harness could not run at all |
| **UX CRITIC** | *(no command — a person)* | all 18 criteria in `docs/ux-rubric.md` PASS against cited evidence. **Not satisfied: R17 is a documented FAIL — see [Status](#status-stated-plainly).** Machine evidence comes from `npm run test:e2e`, which writes into `docs/evidence/` |

### Why the parity gate can survive a redesign

`tests/baseline.json` and `parity-map.json` are **frozen evidence captured from the original before it
was touched**, and `scripts/check-frozen.mjs` proves that from git history rather than from a checksum
this repo could edit in the same commit: each frozen file was introduced by exactly one commit, never
touched again, and the working-tree bytes must equal the blob at that commit. A total redesign can
still be checked against them because **every key is semantic, and row collections are keyed on
business identity — the fund's own code — never on DOM position.**

`pricing.fund.SPORTHFC.publish_px` means "the price SPORTHFC publishes" — `"1.025389"` in the
baseline — not "the third cell of the fifth row", so the rebuild may reorder, resort, rename, re-nest
and re-home any of it and parity still checks. The rebuild's side of the contract is
`src/ui/parity.ts`: every figure renders carrying `data-parity="<the semantic key>"`. The key schema
is in [`docs/parity-map.schema.md`](docs/parity-map.schema.md).

One split was approved at the Phase 2 gate, because the rename table deliberately changes some of the
*words* the baseline captured. Of the 1,020 keys, **978 stay strict** — byte-identical to
`tests/baseline.json` — and **42 are checked against `docs/rename-map.json`** instead: 41 whose text
carries a retired label, plus one declared **correction**, `chrome.footer_assertion`, where the
original asserted ownership is "verified to conserve" and five entities prove it is not. All 42 carry
a **digit guard**: each numeric token in the rendered string must match the baseline's, in order.
Words may change; digits may not. An undeclared relabel is a failure, and the mechanism edits neither
`parity-map.json` nor `tests/baseline.json`. Determinism is pinned rather than hoped for: a fixed
1600×1000 viewport, `en-US`, UTC, reduced motion, a **fresh browser context per scene** so
`sessionStorage` cannot leak the pricing basis from one scene to the next, DOM-stability polling
instead of fixed sleeps, and the Structure graph's Vertical layout (not the force-simulated "Dynamic"
one) as the captured default.

## Offline

The app makes **no off-origin request**: it fetches only `data/*.json` from its own origin and loads
`vendor/d3.min.js` and `vendor/xlsx.full.min.js` from disk on demand. The original loaded `xlsx`
0.18.5 and `d3` 7.8.5 from `cdnjs.cloudflare.com`, so it could not run offline and its Excel export
failed closed with an `alert()`. Both are now committed under `vendor/`,
and `vite.config.ts` serves them in dev and copies them into `dist/` on build. Playwright's `offline`
project aborts every off-origin request and re-runs the app; the parity harness fulfils the original's
two cdnjs URLs from those same files while aborting anything else. Load-bearing rather than hygiene:
cdnjs answers 403 through this environment's proxy, so without the vendored copies the original
cannot render here at all.

## Known data conditions

Real breaks in the source data, preserved exactly and surfaced rather than smoothed. Full write-ups,
with owners, in [`docs/issues.md`](docs/issues.md).

- **Two product NAVs, $2,785.79 apart.** `repricing.json.N` = $2,062,198,835.86 is Σ of the three
  top-level feeders' `ENDING_NAV` (`ASCHON`, `DUNK`, `SPORTHLD`); `lookthrough.json.prodNAV` =
  $2,062,196,050.07 is the fund-entity NAV stamp. The difference is exactly the DUNK feeder's entire
  NAV — `repricing.json.navByFund.DUNK` is 2785.79, and so is `N − prodNAV`, to the cent. Both are
  preserved and both are labelled by basis. Making them agree is a data correction with its own
  sign-off, not a refactor.
- **Five entities whose ownership does not conserve.** Of the 514 entities with units outstanding:
  `ABFSUB6` at 129.29% (through the circular holding `ABFAGB`), `MIDCAP` at 3.10%, `APVCIAGA`
  99.82%, `APVCIAGB` 99.56%, `APVCIINA` 99.56%. The solve is bit-identical to the original's, so
  these are data conditions — but the original's footer claim that ownership is *"verified to
  conserve"* is overstated, and the rebuild does not repeat it (that is the one declared correction
  above). `node scripts/audit-ownership.mjs` reproduces the list.
- **105 source-data defects in five buckets**, as the Data-quality lens reports them: 43
  self-mapping (Medium), 2 circular mapping (High), 29 missing / dangling SPV code (High), 9
  incomplete look-through (Medium), 22 unmapped identifiers (Low).
- **Dead fields in the fixtures.** `EMB.recon` (23 rows), five `EMB` scalars, 7 `PRICING` fields, 5
  `PRICING.recon` fields, `UNI.counts` and two `maxlevel`s are never read. They are kept
  byte-faithfully because fixtures are data of record; `data/README.md` lists every one.
