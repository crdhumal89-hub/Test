# TRACE-Pro

NAV pricing and look-through for Apollo fund products. A controller uses it to answer three
questions in order: *does the NAV tie, what price do I publish, and why is this fund off?*

## What this is

A rebuild of a **934 KB single-file HTML application** — `reference/TRACE-Pro-original.html`, 934,142
bytes, 2,520 lines, with a 1,642-line script block and 617 KiB of data literals welded into it — as
a multi-file TypeScript application.

The point of the exercise is not new features. It is that:

- **The pricing and look-through math is extracted into pure modules** under `src/domain/`. No DOM,
  no application state, no imports from `ui/` or `state/`. Each one is unit-tested on its own, and
  the ownership solve is additionally tested *differentially* against the original's algorithm,
  entity by entity.
- **Not one figure the tool reports has changed.** That is not an aspiration; it is a gate. 1,020
  semantic figures were captured from the original while it was intact, frozen as
  `tests/baseline.json`, and the rebuild is diffed against them on every run. Zero value diffs is the
  pass condition. See [The verification gate](#the-verification-gate).

Seven cryptically-named tabs (`lt rfx str sim iss own gls`) became three screens and two drawers.
Nothing was deleted; four of the old tabs became four lenses over one selected entity, so chasing a
break stops costing four separate searches for the same fund code. The full inventory of the
original, the alternatives considered, and the reasoning are in
[`docs/redesign-spec.md`](docs/redesign-spec.md).

## What each screen answers

Every screen renders its question as the first text in its content region. These are the strings in
the source, not a paraphrase.

| Screen | The question it answers |
|---|---|
| **Reconciliation** *(landing)* | "Does this product's NAV agree with the value of what it holds, and where is the difference?" |
| **Pricing** | "What unit price do I publish for each fund today, and what does repricing do to value?" |
| **Diagnose** | "Why is this entity off — how is it wired, who owns it, is its data sound, and what happens if it moves?" |

Diagnose is one selected entity seen through four lenses. Switching lens never clears the selection.

| Lens | The question it answers |
|---|---|
| **Structure** | "How is this product wired — who owns whom, and where is concentration?" |
| **Ownership** | "Who ultimately owns this position, and in what proportion?" |
| **Data quality** | "What is wrong with the source data before I trust any figure above?" |
| **Simulator** | "If this fund's value or units move, what happens to product NAV, and through which holders?" |

Two drawers are one action from every screen: the **Glossary** (35 terms — the definition layer
behind every label, also opened with the `G` key) and **Data sources & as-of** (which report each
figure came from, and as of when).

What a first-run reader must be able to see on each of those, without scrolling or clicking, is
named in advance in [`docs/first-run.md`](docs/first-run.md).

## The file tree

```
trace-pro/
├── index.html                  shell only: <div id="app"> and a loading state. No data, no logic.
├── package.json                the scripts below; nothing outside them is a supported command
├── vite.config.ts              serves data/ and vendor/ from the repo root; copies both into dist/
├── tsconfig.json  eslint.config.js  vitest.config.ts  playwright.config.ts
│
├── src/
│   ├── main.ts                 boot: read product + as-of from the URL → load fixtures → build
│   │                           state → mount the shell → mount the screen. Fixture failures
│   │                           surface as an error state AND re-throw, so nothing fails silently.
│   ├── domain/                 ── THE MATH. Pure. No DOM, no state. Unit-tested. ──
│   │   ├── types.ts            fixture and model shapes; fixture field names are the original's
│   │   ├── money.ts            every formatter, one per quantity class (see docs/labels.md)
│   │   ├── lookthrough.ts      the three values per node — derived / revised / NAV — and the tree
│   │   ├── repricing.ts        bottom-up NAV repricing: terminal price = NAV ÷ units, roll upward
│   │   ├── ownership.ts        effective shares by fixed point, so cross-holdings and cycles resolve
│   │   ├── cascade.ts          shock propagation and the staged reprice, one topological pass
│   │   ├── reconciliation.ts   the additive waterfall, the per-driver bridge, the tie check
│   │   └── exceptions.ts       ONE definition of the $250k / 50 bps materiality rule, the bps
│   │                           bands, and every top-N truncation
│   ├── state/store.ts          the only mutable state, and the only thing that notifies on change.
│   │                           Owns: product, as-of, screen, lens, pricing basis, and the one
│   │                           selectedEntity the four Diagnose lenses share.
│   ├── data/load.ts            fixture fetching: the manifest, URL → selection, core bundle, and
│   │                           the lazily-loaded 472 KiB ownership universe
│   ├── ui/                     ── RENDERING ONLY. Reads state, calls domain, computes no figure. ──
│   │   ├── chrome/shell.ts     masthead, never-collapsible as-of badge, pricing-basis control, nav
│   │   ├── parity.ts           tags each rendered figure with its semantic parity key
│   │   ├── primitives/         dom.ts (addEventListener only; keyboard-activates anything
│   │   │                       clickable), combobox.ts
│   │   ├── screens/            reconciliation/ · pricing/ · diagnose/{structure,ownership,…}
│   │   ├── drawers/            glossary.ts · sources.ts
│   │   └── styles/             app.css (tokens first) · components.css
│   └── glossary/               the 35 terms as data, split by section
│
├── data/                       ── FIXTURES. Fetched at runtime; never imported. ──
│   ├── manifest.json           products × as-of dates, and the default
│   └── apollo-sports-capital/2026-06-30/
│       ├── lookthrough.json    was EMB      · 149 tree nodes            49.6 KiB
│       ├── universe.json       was UNI      · firm-wide ownership graph 472.5 KiB (lazy)
│       ├── repricing.json      was REVBASE  · the authoritative recon    31.3 KiB
│       ├── simulator.json      was SIM                                   31.4 KiB
│       └── legacy-pricing.json was PRICING  · legacy model, mostly dead  29.6 KiB
│
├── vendor/                     committed, offline: xlsx.full.min.js 0.18.5 · d3.min.js 7.8.5
│
├── reference/                  ── FROZEN, READ-ONLY. The originals. ──
│   ├── TRACE-Pro-original.html            the artifact under study (934,142 bytes)
│   ├── TRACE-sibling-original.html        context only
│   └── TRACE_Platform-shell-original.html context only
│
├── parity-map.json             FROZEN. 1,020 semantic keys → where each figure lives in the
│                               ORIGINAL. Keyed on meaning, never on DOM position.
├── tests/
│   ├── baseline.json           FROZEN evidence: every one of those 1,020 figures, as the original
│   │                           rendered it
│   ├── unit/                   the domain modules — ownership solve, look-through walk, repricing
│   │                           cascade, reconciliation bridge, plus the differential test
│   └── e2e/                    the headless suite (Playwright), and its helpers
│
├── scripts/
│   ├── snapshot.mjs            THE PARITY HARNESS. Captures or diffs the 1,020 keys.
│   ├── check-limits.mjs        file length, data literals, duplicate identifiers, inline handlers,
│   │                           !important
│   ├── extract-fixtures.mjs    extracts data/ from the original, and re-verifies it (--check)
│   ├── classify-keys.mjs       derives which baseline keys carry a retired label, and checks
│   │                           docs/rename-map.json against that set key-for-key
│   ├── audit-ownership.mjs     names the entities whose ownership does not conserve
│   ├── probe.mjs  smoke.mjs    authoring aids, not gates
│   └── lib/                    server.mjs (static server) · browser.mjs (pinned browser context) ·
│                               parity.mjs · extract.mjs · steps.mjs
│
└── docs/
    ├── redesign-spec.md        FROZEN. The 7-screen inventory, the IA decision, the rename table,
    │                           the module and data plans, and 8 open questions with resolutions.
    ├── ux-rubric.md            FROZEN. The 18 criteria this is graded against.
    ├── rename-map.json         FROZEN. Per key, the exact string the rebuild must render where the
    │                           vocabulary changed — with a guard that every digit survives.
    ├── ledger.md               what is built, and what the gate currently reports. Read this first.
    ├── issues.md               every defect found in the original, resolved or carried
    ├── labels.md               label → quantity, and the precision rule per quantity class
    ├── first-run.md            the primary answer named in advance, per screen and lens
    ├── exceptions.md           the register for inline handlers and !important (currently empty)
    └── evidence/               screenshots and machine output cited by the rubric
```

`domain/` owns every number and knows nothing about screens. `state/` owns what is selected and
notifies. `ui/` owns pixels and may not compute a figure — if a component needs a number it asks the
domain. Fixtures are fetched, never imported, so no source file carries a data literal. Those
boundaries are enforced mechanically: no source file over 400 lines, no data literal over 2,000
characters, and no identifier declared at top level in two modules.

`docs/ledger.md` is the live build state. The screens land one at a time with the gate green after
each, so treat the ledger — not this README — as the answer to "is that screen finished".

## How to run it

Toolchain: Vite 8 · TypeScript 6 · Vitest 4 · ESLint 10 · Playwright 1.56, all from
`package.json`. `package.json` declares no `engines` floor; this is built and run on Node 22
(`node --version` → v22.22.2).

```bash
npm install         # the toolchain only; the app itself has zero runtime dependencies
npm run dev         # dev server on http://localhost:5178
npm run build       # production build into dist/, with data/ and vendor/ copied alongside
npm run preview     # serve the built dist/ exactly as it will ship
```

Nothing else is a supported entry point. Every command in this README is a script in
`package.json`; the full list is `dev`, `build`, `preview`, `typecheck`, `lint`, `test`,
`test:e2e`, `test:e2e:app`, `test:e2e:offline`, `fixtures:extract`, `fixtures:check`,
`snapshot:original`, `gate:static`, `gate:parity`, `gate`.

## Pointing it at a different product and as-of date

Both are read from the URL at boot and resolved against `data/manifest.json`
(`resolveSelection()` in `src/data/load.ts`):

```
http://localhost:5178/?product=apollo-sports-capital&asof=2026-06-30
```

- `product` is a **slug** matching a `products[].slug` in the manifest. Unknown slug → the
  manifest's `default.product`.
- `asof` must be listed in that product's `asOfDates`. Unknown date → that product's first as-of.
- Neither parameter given → `default.product` and `default.asof`, today
  `apollo-sports-capital` / `2026-06-30`.

Fixtures are then fetched from `data/<product-slug>/<as-of>/`. **Adding a product is a data change,
not a code change:**

1. Create `data/<your-slug>/<YYYY-MM-DD>/` and drop in the five fixture files —
   `lookthrough.json`, `universe.json`, `repricing.json`, `simulator.json`, `legacy-pricing.json`.
   The field names inside them are the original's and are the on-disk contract (`src/domain/types.ts`).
2. Add one entry to `data/manifest.json`: `slug`, `name` (what the masthead shows), `code` (the
   short product code), `asOfDates`, and the `files` map.
3. Reload with `?product=<your-slug>`. Nothing is rebuilt and no constant is edited.

Adding a second as-of date for an existing product is step 1 plus appending to that product's
`asOfDates`.

Two things worth knowing before you do it. The 472 KiB `universe.json` is fetched lazily — only the
Ownership and Data-quality lenses need it, so the other screens never pay for it. And **the app
never reads a clock**: there is no `new Date`, `Date.now`, or `Math.random` anywhere, in the original
or the rebuild. `asof` is a data field. Every rendered figure is a pure function of the fixtures,
which is what makes byte-identical snapshots possible at all.

## The verification gate

Four sub-gates. The first three are commands; the fourth is a person.

| Sub-gate | Command | What must be true |
|---|---|---|
| **STATIC** | `npm run gate:static` | `vite build` exits 0 · `tsc --noEmit` exits 0 · `eslint .` exits 0 · `scripts/check-limits.mjs` exits 0 (no file > 400 lines, no data literal > 2,000 chars, no duplicate top-level identifier, zero inline `on*=`, zero `!important`) · `extract-fixtures.mjs --check` exits 0 |
| **UNIT** | `npm test` | every `tests/unit/` spec passes, with direct tests for the ownership solve, the look-through walk, the repricing cascade and the reconciliation bridge |
| **PARITY** | `npm run gate:parity` | zero value diffs against `tests/baseline.json`, and zero unresolved keys. Exit 1 means a key could not be found; exit 2 means a figure changed |
| **UX CRITIC** | *(no command — a person)* | an independent reviewer scores all 18 criteria in `docs/ux-rubric.md` PASS, each against cited evidence: a file:line, a named test, a screenshot, or pasted command output. Its machine evidence is produced by `npm run test:e2e`, which writes into `docs/evidence/` |

`npm run gate` runs the chain: `gate:static` → `test` → `test:e2e` → `gate:parity`. It needs a
current `dist/`, which `gate:static` produces. The headless suite has two projects and can be run
separately — `npm run test:e2e:app` for the functional and rubric checks, `npm run test:e2e:offline`
for the same app with every off-origin request aborted.

Supporting commands: `npm run lint` is the static half on its own; `npm run typecheck` is `tsc
--noEmit`; `npm run fixtures:check` re-asserts the fixtures against the original;
`npm run snapshot:original` re-captures the 1,020 keys from the frozen original.

### Why the parity gate can survive a redesign

`tests/baseline.json` and `parity-map.json` are **frozen evidence captured from the original before
it was touched**. The map says where each of the 1,020 figures lives *in the original*; the baseline
says what each one rendered. Both were authored in Phase 1 and neither is edited again — if a figure
moves, the code changes, not the evidence.

The reason a total redesign can still be checked against them is that **every key is semantic, and
row collections are keyed on business identity — the fund's own code — never on DOM position**:

```
reconciliation.waterfall.derived_mv
pricing.fund.SPORTHFC.publish_px
pricing.bridge.apex.DUNK.gap_usd
ownership.APPOURI.ultimate_sum_check
structure.fullscreen.product_nav
```

`pricing.fund.SPORTHFC.publish_px` is "the price SPORTHFC publishes", not "the third cell of the
fifth row". So the rebuild may reorder, resort, rename, re-nest and re-home any of it and parity
still checks — which is exactly the freedom the redesign needed. The rebuild's side of the contract
is `src/ui/parity.ts`: each figure is rendered carrying `data-parity="<the semantic key>"`, so the
harness needs no knowledge of our layout and the answerable key is visible at the point of render.

One split was approved at the Phase 2 gate, because the rename table deliberately changes some of
the *words* the baseline captured: **983 of the 1,020 keys stay strict** — byte-identical to
`tests/baseline.json` — and the **37 keys whose text carries a retired label** are checked instead
against `docs/rename-map.json`, which declares the exact replacement string per key and carries a
**digit guard**: every numeric token in the rendered string must match the baseline's, in order.
Words may change; digits may not. A relabel that is not declared in that map is a failure, not a
pass, and neither `parity-map.json` nor `tests/baseline.json` is edited by the mechanism.

Determinism is pinned rather than hoped for: a fixed 1600×1000 viewport, `en-US`, UTC, reduced
motion, a **fresh browser context per scene** so `sessionStorage` cannot leak the pricing basis from
one scene into the next, DOM-stability polling instead of fixed sleeps, and the Structure graph's
Vertical layout (not the force-simulated "Dynamic" one) as the captured default.

Two figures are deliberately keyed apart rather than reconciled:
`structure.fullscreen.product_nav` = `$2,062,196,050.07` against
`reconciliation.waterfall.nav` = `$2,062,198,836`. That $2,785.79 is a real condition in the data
and is [pinned as a fact](#known-data-conditions), not averaged away.

## Offline

The app makes **no off-origin requests**. It fetches only `data/*.json` from its own origin.

The original loaded `xlsx` 0.18.5 and `d3` 7.8.5 from `cdnjs.cloudflare.com`, so it could not run
offline and its Excel export failed closed with an `alert()`. Both are now committed under
`vendor/` — `xlsx.full.min.js` (0.18.5) and `d3.min.js` (7.8.5) — and `vite.config.ts` serves them
in dev and copies them into `dist/` on build. The Playwright config carries a dedicated `offline`
project that aborts every off-origin request and re-runs the suite, and the parity harness fulfils
the original's two cdnjs URLs from those same files while aborting anything else. This was
load-bearing rather than hygiene: cdnjs answers 403 through this environment's proxy, so without the
vendored copies the original cannot render here at all.

## Known data conditions

Real breaks in the source data, preserved exactly and surfaced rather than smoothed. Full write-ups,
with owners, in [`docs/issues.md`](docs/issues.md).

- **Two product NAVs, $2,785.79 apart.** `repricing.json.N` = $2,062,198,835.86 is Σ top-level
  feeder `ENDING_NAV`; `lookthrough.json.prodNAV` = $2,062,196,050.07 is the fund-entity NAV stamp.
  The difference is exactly the DUNK feeder's entire NAV. Both are preserved and both are labelled by
  basis. Making them agree is a data correction with its own sign-off, not a refactor.
- **Five entities whose ownership does not conserve.** Of the 514 entities with units outstanding:
  `ABFSUB6` at 129.29% (through the circular holding `ABFAGB`), `MIDCAP` at 3.10%, `APVCIAGA`
  99.82%, `APVCIAGB` 99.56%, `APVCIINA` 99.56%. The solve is bit-identical to the original's, so
  these are data conditions — but the original's footer claim that ownership is *"verified to
  conserve"* is overstated, and the rebuild does not repeat it. `node scripts/audit-ownership.mjs`
  reproduces the list.
- **105 source-data defects in five buckets**, as the Data-quality lens reports them: 43 self-mapping
  (Medium), 2 circular mapping (High), 29 missing / dangling SPV code (High), 9 incomplete
  look-through (Medium), 22 unmapped identifiers (Low).
- **Dead fields in the fixtures.** `EMB.recon` (23 rows), five `EMB` scalars, 7 `PRICING` fields, 5
  `PRICING.recon` fields, `UNI.counts` and two `maxlevel`s are never read. They are kept
  byte-faithfully because fixtures are data of record; `data/README.md` lists every one.
