# TRACE-Pro — UX scorecard

**Graded by:** an independent reviewer who did not design or build this application.
**Graded against:** `docs/ux-rubric.md`, unmodified (18 criteria, R1–R18, frozen at Phase 0).
**Date of pass:** 2026-08-03. **Build under test:** `dist/` from `npm run build` at commit `4687f2a`.
**Method:** every score below cites something I ran, read or measured myself. Nothing in `docs/`,
in a commit message or in a code comment was taken at face value; where a shipped test asserts
something weaker than its criterion's bar, the criterion is graded against the bar, not the test.

The green baseline is real and was reproduced: `npx playwright test` → **41 passed**;
`npm test` → **105 passed**; `npm run lint` → STRUCTURE CHECK PASSED + FIXTURE CHECK PASSED;
`node scripts/snapshot.mjs --target dist/ --diff tests/baseline.json --expect-renamed` → **1020 keys,
0 digit violations, 0 diffs, RESULT: PASS**. That baseline is not the rubric, and the rubric is what
this file scores.

## Result

| Score | Count |
|---|---|
| **PASS** | **5** — R1, R11, R15, R16, R18 |
| **FAIL** | **13** — R2, R3, R4, R5, R6, R7, R8, R9, R10, R12, R13, R14, R17 |

**Gate result: FAIL.** The rubric's own rule is "PASS only if all 18 are PASS with cited evidence."

New evidence generated for this pass is in `docs/evidence/review-*` (screenshots, JSON, and the
probe scripts under `docs/evidence/review-scripts/` so every number below is reproducible against a
running `npx vite preview --port 4178`).

---

## Scorecard

| # | Criterion | Score | Evidence cited |
|---|---|---|---|
| R1 | Every screen states, in one line at the top, the question it answers | **PASS** | My DOM walk of `#screen` per route: the first visible text on every route is the question, ≤ 140 chars, ends in `?`, real text nodes — reconciliation 91 chars, pricing 86, diagnose 103, structure 70, ownership 58, data quality 67, simulator 91. `tests/e2e/rubric.spec.ts:44-58`. Caveat below. |
| R2 | No user-visible bare abbreviation survives outside the glossary | **FAIL** | `docs/evidence/review-abbreviations.json` (full rubric denylist, whole-word, case-sensitive): `NAV` on 6/6 screens, `SPV` on 6/6, `VPM` on 3, `px` ×40 and `MV`/`Qty` on the Simulator, `qty` on Ownership — none expanded on the screen, and no glossary-linked label exists anywhere (`glossaryFocusTerm` is only ever assigned `null`, `src/ui/chrome/shell.ts:143`). |
| R3 | Every displayed figure carries a unit and an as-of date | **FAIL** | 5 of 6 screens contain **zero** as-of text in their content region (`docs/evidence/review-rendered-text.json`); `.masthead` has no `position: sticky` (`src/ui/styles/app.css:77-80`), so scrolling 563 px on Pricing puts `#asof` 541 px above the viewport with 146 figures on screen, and 718 px on Ownership with 134 figures on screen and no date anywhere. |
| R4 | Every data-dependent panel has a defined loading, empty, and error state | **FAIL** | `loadingState` is called in exactly 2 files and `errorState` in 5; the reconciliation tree, the price table and the repricing walk have neither. Zero tests reach a loading or an error state for any panel (`grep -rniE "loading\|error" tests/e2e` → only console-listener plumbing). No `input[type=file]` exists in `src/`. |
| R5 | A first-run user reaches the primary answer on each screen with no instruction | **FAIL** | `docs/evidence/review-above-the-fold.json` at 1600×1000 against the selectors `docs/first-run.md` names: Pricing publish-price rows 1–5 → only row 1 is above the fold (row 1 bottom 921, rows 2–5 below 1000); `#structure-stage svg` bottom 1195; `#ownership-ribbon` height **0**; `#simulator-baseline` and `#simulator-subject` **do not exist**, `#simulator-shock` top 1333. |
| R6 | Keyboard focus is visible on every element, and every control is reachable | **FAIL** | `docs/evidence/review-focus-walk.json`: 39 zero-height focus stops on Ownership. `docs/evidence/review-focus-ring-tabbed.png`: the basis toggle is focused with `:focus-visible` matching and `outline: rgb(10,125,104) solid 2px`, yet **no ring is drawn** — clipped by `.view-toggle{overflow:hidden}` (`src/ui/styles/app.css:100`); measured ring-vs-fill contrast 2.81:1 (< 3:1). Focus is not restored on close by any overlay (glossary, sources, row detail all land on `BODY`). |
| R7 | The glossary is reachable from every screen in one action | **FAIL** | 35 `.glscard` terms ✓, one click from every route ✓, selection survives ✓ (my run + `tests/e2e/rubric.spec.ts:169-191`). But the bar's "clicking a glossary-linked label anywhere opens the glossary *at that term*" is unimplemented: 0 glossary-linked labels on any screen, `glossaryFocusTerm` never set to a term, and no deep-link test exists. |
| R8 | Every defect found in the original is resolved or carried with a reason | **FAIL** | The rubric's named evidence — "a script that fails if any inventoried item is missing" — does not exist (`grep -rn 'issues.md' scripts/ tests/ package.json` → nothing). `docs/issues.md` §F's proof is false (see R9). §E, §O3, §O6, §O9, §H, §J, §O1 all disposition items as "not built" / "not yet written" for screens, lenses, tests and fixture fields that are shipped. |
| R9 | One definition of every business rule | **FAIL** | `grep -rn '250_000\|250000' src/` returns **four** lines, not one: `src/export/excel.ts:115` and `:117` re-implement the whole materiality rule (`>= 250_000 && … >= 50`) instead of calling `isMaterial()`. `src/domain/repricing.ts:276` duplicates the top-14 truncation as `.slice(0, 14)` outside `TRUNCATE`. `tests/unit/rules.spec.ts` does not exist. |
| R10 | No two different quantities share a user-visible label | **FAIL** | "Product NAV" labels two different quantities: `$2,062,196,050.07` (fund-entity, `structure.fullscreen.product_nav`) and `$2,062,198,835.86` (Σ-feeder, pricing bridge / simulator ledger) — `docs/labels.md` §1 itself forbids this. Under the Repriced basis the price table renders "Repriced mark" and "Repriced unit price" as two columns carrying the same value (`1.011702`). No machine uniqueness check exists. |
| R11 | Every figure states its basis | **PASS** | My capture of the price table in both bases: Current marks → "Current mark / Look-through value / Repricing gain or loss"; Repriced → "Repriced mark / Look-through value at repriced marks / Repricing gain or loss (reconciled)". `#structure-basis` states both product NAVs with their bases and the $2,785.79 reason; waterfall NAV carries "sum of top-level feeder NAVs". Caveat below. |
| R12 | The pricing view is never ambiguous and never offered where it is meaningless | **FAIL** | My toggle-and-diff on the three lenses: `#view-toggle` is visible on Structure, Ownership and Data quality and flipping it changes **nothing** (`screenChangedByToggle: false` on all three). `#view-note` sets `hidden = true` (`src/ui/chrome/shell.ts:221`) but CSS gives it `display:flex`, so it still occupies a 19 px empty band — which is why the committed `docs/evidence/pricing-basis.json` records `noteVisible: true` on all six routes. |
| R13 | Exports produce a file, and the file agrees with the screen | **FAIL** | `docs/evidence/review-exports/`: the look-through CSV is byte-identical in both bases (18,954 B) and under Repriced its look-through values `2060224441.40 / 291966467.55 / 281726437.96` contradict the screen's `$2,060,610,338 / $292,016,326 / $281,776,297`. The send-to-pricing CSV has 4 columns of which 2 (`Respective Qty`, `Local MV`) appear nowhere on the Pricing screen, so 3 spot ties are impossible. `tests/e2e/exports.spec.ts` does not exist. |
| R14 | Nothing fails silently | **FAIL** | Three of four clauses hold (0 `console.*`/`alert()` in `src/`, `no-empty` with `allowEmptyCatch:false` at error level, 0 console errors across every run I made). The fourth fails: `src/ui/screens/diagnose/structure/graph.ts:228` catches with no binding, discards the error, and paints the words "structure unavailable" inside the SVG — neither an R4 error state nor a re-throw. |
| R15 | The app runs with the network disabled | **PASS** | My own offline context (every off-origin request aborted): all three screens, four lenses, both drawers, and **all four exports** produced files — 18,954 / 32,543 / 995 / 34,150 bytes — with `blocked: []` and `problems: []`. `vendor/xlsx.full.min.js` 0.18.5 and `vendor/d3.min.js` 7.8.5 are committed. Caveat below. |
| R16 | Selection survives navigation | **PASS** | My run: entity `APPOURI` survives all four lens switches, a drawer open/close, and the basis toggle; `#tree` expanded rows 149 → 149 after leaving to Pricing and returning; the Pricing filter "SPORTA" survives the same round trip. `tests/e2e/rubric.spec.ts:235-257`. Finding below. |
| R17 | Numeric precision is consistent and documented | **FAIL** | The same quantity class, bps, is rendered three ways: 1 dp signed with suffix (`formatBpsOf`, waterfall + score strip), 0 dp signed with suffix (`formatBpsCompact` at `src/ui/screens/pricing/bridge.ts:88` and `:144` — the same screen as the 1 dp strip), and 0 dp **unsigned, no suffix** (`src/ui/screens/pricing/price-table.ts:36-40`). The rubric fixes bps at 1 dp. |
| R18 | Empty and zero results have a recovery path | **PASS** | Live: combobox → "No entity matches that. Clear the box to see every fund and SPV in this product."; pricing filter → "No fund matches “zzzz”. All 26 funds are still here." + a "Clear the filter" button; glossary → two empty states with reset actions (`src/ui/drawers/glossary.ts:152-162`); simulator → "Nothing selected yet — choose a fund from the entity list below." Weak spot below. |

---

## Every FAIL: what is wrong, where, and what would fix it

### R2 — bare abbreviations survive on every screen
**What is wrong.** The rubric's denylist has 26 tokens. The shipped crawler
(`tests/e2e/rubric.spec.ts:34-40`) carries 12 code tokens and 14 phrase tokens of its own invention,
and **drops 11 of the rubric's**: `MV`, `px`, `qty`, `apex`, `NAV`, `bps`, `SPV`, `VPM`, `Δ`, `FR`,
`DC`. Its code-token rule also only fires when the token is the *entire* text of an element, so
`Total qty: …` and `px 1.122812` cannot be caught by construction.

Running the rubric's own denylist (`docs/evidence/review-abbreviations.json`):

| Token | Where it appears bare | Expanded on that screen? |
|---|---|---|
| `NAV` | all six screens (16 occurrences on Reconciliation alone) | **No.** "net asset value" exists only in `src/glossary/terms-nav.ts:20` and `src/ui/drawers/sources.ts:48` — neither is on a screen. |
| `SPV` | all six screens — row tag `SPV`, `SPV / holding`, `SPV / FUND`, `SPV fund code`, chip "Dangling SPV", bucket "Missing / dangling SPV code" | **No.** "special purpose vehicle" appears only as a hidden search keyword, `src/glossary/terms-structure.ts:22`. |
| `VPM` | column header "VPM symbol" (Reconciliation `src/ui/screens/reconciliation/tree.ts:16`, Ownership `owner-tree.ts:107`), "missing VPM symbol / name" on Data quality | **No.** |
| `px` | 40 graph-node captions on the Simulator — `px 1.122812` | **No.** |
| `MV`, `Qty` | Simulator help line "Click a node to shock its **MV / Qty / NAV** & hit **Run**" | No (a "market value" mention sits in a different paragraph, below). |
| `qty` | Ownership `Total qty: 1,330,020,204`, column "Qty held" | **No.** |

Both of the rubric's escape hatches are therefore closed: nothing is expanded on first use on the
screen, and route (b) — "rendered as a glossary-linked term that opens the definition in one action"
— **does not exist in the product**. `glossaryFocusTerm` is written in exactly one place, as `null`
(`src/ui/chrome/shell.ts:143`); `src/ui/drawers/glossary.ts:353,369` are ready to consume it and
nothing ever sets it.

The Simulator's help text is the worst single instance and is also plainly broken prose. It reads
"Click a node to shock its MV / Qty / NAV & hit **Run** · **Run full reprice** sweeps the whole book
… **Step by stage** lets you click each level … open the **▤ Ledger** tray", and is immediately
followed by a shipped erratum: "Those two controls are now labelled Reprice everything (bottom-up)
and Reprice one level at a time, and the ledger sits beside the graph rather than in a tray." There
is no control named Run, Run full reprice, Step by stage or Ledger tray on that lens
(`docs/evidence/review-fold-diagnose-simulator.png`). The prompt's suspicion about
`simulator.help_text` naming retired controls is confirmed.

**Fix.** Expand on first use per screen ("net asset value (NAV)", "special purpose vehicle (SPV)",
"VPM — the firm's accounting system"), replace `px` with "unit price" and `Total qty` with "Units
outstanding", implement the glossary deep link (a `<button class="gterm">` that sets
`glossaryFocusTerm`), rewrite `simulator.help_text` to name the controls that exist, and restore the
rubric's 26 tokens in the crawler with whole-word rather than whole-element matching.

### R3 — figures are readable with no as-of date in sight
**What is wrong.** The shipped assertion is `expect(await page.locator('#asof').isVisible())`
(`tests/e2e/rubric.spec.ts:100-103`) — a single element, on load, before any scrolling. The bar is
"every panel containing figures resolves to a visible as-of date … on the figure's panel or on a
**persistent** chrome element visible simultaneously with it".

Measured: the content regions of Reconciliation, Structure, Ownership, Data quality and Simulator
contain no as-of text at all (only Pricing does, twice). `.masthead` is a plain flex row with no
`position: sticky` (`src/ui/styles/app.css:77-80`) inside a normally scrolling document (heights
1177–3234 px against a 1000 px viewport). Scrolled to the Pricing price table (`scrollY` 563),
`#asof` is at `top: -541` while 146 figures are inside the viewport. On Ownership (`scrollY` 718),
`#asof` is at `top: -696` with 134 figures on screen — units, percentages and shares, with no date
anywhere on the screen. Opening either drawer also covers the masthead, including `#asof`.

Secondary: the price table's three unit-price columns ("Price to publish", "Current mark", "Repriced
unit price") carry no unit in the header; the reader gets `1.024650` and a caption sentence.
`docs/first-run.md` line 44 claims the waterfall NAV basis reads "sum of top-level feeder NAVs · as
of 2026-06-30"; it actually renders "· NAV report".

**Fix.** `position: sticky; top: 0` on `.masthead` (and keep it clear of the drawer), or stamp the
as-of on each figure-bearing panel. Add "· USD/unit" to the three price column headers.

### R4 — loading and error states do not exist for three named panels, and no state is test-reachable
**What is wrong.** The bar names the panels and requires all three states "each *reachable in a
test*". `loadingState` is imported in 2 files (`data-quality/index.ts:85`, `ownership/index.ts:93`)
and `errorState` in 5. The reconciliation tree, the price table and the repricing walk import
neither: `src/ui/screens/reconciliation/tree.ts`, `pricing/price-table.ts` and
`pricing/repricing-walk.ts` have no loading and no error path at all. The Structure and Simulator
lenses have an error state but no loading state. There is no `input[type=file]` anywhere in `src/`,
so the "two upload slots" have no states to reach — `src/ui/drawers/sources.ts:9` calls them
"present but inert". And no test in `tests/e2e/` withholds a fixture or rejects a fetch: the entire
suite exercises the happy path plus two empty states.

**Fix.** Route every panel through a `{loading|ready|empty|error}` render, and add
`tests/e2e/states.spec.ts` that (a) delays `data/*.json` to assert the loading state, (b) filters to
zero rows, (c) `page.route(... route.abort())` on each fixture to assert the error state and its
recovery action, per panel.

### R5 — the primary answer named in `docs/first-run.md` is not above the fold on three screens, and the Simulator's contract elements do not exist
**What is wrong.** `docs/first-run.md` is a defensible contract: it names one primary answer per
screen and the selectors that must be in a 1600×1000 viewport. Measured against it
(`docs/evidence/review-above-the-fold.json`, screenshots `docs/evidence/review-fold-*.png`):

| Screen | first-run.md requires | Measured |
|---|---|---|
| Reconciliation | tie pill, 5 waterfall steps, NAV + basis, both differences in $ and bps, exception chips, question | all above the fold ✓ |
| Pricing | "At least the first five funds' price to publish" | **row 1 only** (row 1 bottom 921; rows 2–5 below 1000). The file predicted this exact failure under "Live risk on this screen". |
| Structure | `#structure-stage` and its `svg` drawn | **svg bottom 1195** — the graph is cut by the fold |
| Ownership | `#ownership-ribbon`, "up to 40 segments, largest first" | **height 0** — 40 `.own-seg` children exist with no CSS at all (`grep -n "own-ribbon\|own-seg" src/ui/styles/*.css` → no match), so the ribbon is invisible |
| Data quality | question, KPI, scope, five buckets | all above the fold ✓ |
| Simulator | `#simulator-baseline`, `#simulator-subject`, `#simulator-shock`, `#simulator-stage` | **`#simulator-baseline` and `#simulator-subject` do not exist**; `#simulator-shock` top 1333; `#simulator-stage` bottom 1315 |

The test does not assert these. It asserts one element per route
(`tests/e2e/rubric.spec.ts:111-118`), and for the Simulator it asserts `#simulator-runline` — a
selector that appears nowhere in `docs/first-run.md`. The Simulator also arrives with "Nothing
selected yet — choose a fund from the entity list below." while the Diagnose subject bar reads
`APPOURI`, which breaks the bar's "an entity must be pre-selected so the lenses are never empty on
arrival" and the file's own "Never empty on arrival".

**Fix.** Style `.own-ribbon`/`.own-seg` (they are also R6 focus targets); lift the price table above
the Pricing bridge, or move the bridge below it; shorten the Structure and Simulator stages so the
first rank of nodes is in view; render `#simulator-baseline`/`#simulator-subject` and seed the
Simulator's subject from `AppState.selectedEntity`; then point the R5 test at the `first-run.md`
selectors rather than at whatever passes.

### R6 — focus is invisible in two different ways, and no overlay restores focus
**What is wrong.** Three of the bar's four clauses fail.

1. **39 invisible tab stops.** On Ownership the walk has 118 stops, of which 39 are the zero-height
   ribbon segments (`div[role=button] "Apollo Credit Strategies Master Fund Ltd., 11.45% — go to its
   row"`, `w:178 h:0`) — `docs/evidence/review-focus-walk.json`. They are also in the *committed*
   evidence (`docs/evidence/tab-order-diagnose-ownership.json` stops 7–45), and the shipped test
   passed them because it only rejects stops whose tag is `div|span|td|tr|th` *without* a role
   (`tests/e2e/rubric.spec.ts:163`) and never looks at geometry.
2. **A clipped focus ring on every screen.** Tabbing to the pricing-basis segment yields
   `:focus-visible` = true and `outline: rgb(10,125,104) solid 2px`, and **nothing is drawn**:
   `.view-toggle{ … overflow: hidden }` (`src/ui/styles/app.css:100`) clips an outline that is
   offset 2 px outside the button. Screenshot: `docs/evidence/review-focus-ring-tabbed.png`. Where
   the ring is drawn over the active navy segment its measured contrast is **2.81:1**, under the
   bar's ≥ 3:1; the same 2.81:1 appears on the active "Prices to publish" tab and the "Vertical" and
   "1×" segment buttons. The shipped check only scans stylesheets for `outline:none`
   (`tests/e2e/rubric.spec.ts:133-154`) and never computes contrast or looks at clipping.
3. **Focus is never restored.** `trapFocus` captures `previous` and calls `previous?.focus()` on
   release (`src/ui/primitives/dom.ts:154-157`), but the masthead and the tree are re-rendered via
   `replace()` while the overlay is open, so `previous` is a detached node by then. Measured: after
   Esc, `document.activeElement` is `BODY` for the glossary, for the sources drawer, and for the
   row-detail drawer. `tests/e2e/screens.spec.ts:46` is titled "Escape closes it and restores focus"
   and asserts only `toBeHidden()`.

What does work, and I verified it: the graph nodes are genuinely reachable — `#structure-stage`
holds 46 `g[role=button]` elements on a roving tabindex, ArrowDown moves from the product node to
`ASCHON`, and drawers do trap focus (0 escapes over 60 Tabs and 10 Shift+Tabs) and close on Esc.

**Fix.** Give `.own-seg` a real height; drop `overflow:hidden` from `.view-toggle` (or use
`box-shadow` as the ring); pick a focus colour that clears 3:1 on the navy fill; restore focus by
id/selector rather than by node reference. Then assert geometry, contrast and restoration in the
walk.

### R7 — no label anywhere is a glossary link
**What is wrong.** The bar has four clauses; the fourth — "Clicking a glossary-linked label anywhere
opens the glossary *at that term*" — is not implemented, and the named evidence ("a deep-link test
from a label to its term") does not exist. Measured: 0 elements matching
`[data-glossary-term], .gterm, a[href*=glossary]` in `#screen`; `glossaryFocusTerm` is only ever set
to `null`. This is also what makes R2 unrecoverable.

Separately, with the Data-sources drawer open the Glossary button is *behind* the drawer:
`document.elementFromPoint` over its centre returns `drawer-head`, and a click times out. The `G`
key still works, which keeps this clause inside the letter of the bar ("a single click **or** a
single documented keypress"), but a mouse user has no route.

**Fix.** Wrap denylisted labels in a `gterm` control that sets `glossaryFocusTerm`; add the
deep-link test; inset the drawer so it does not cover the masthead actions.

### R8 — the register is not cross-checked, and seven dispositions are no longer true
**What is wrong.** The inventory coverage itself is good: every item the rubric enumerates appears
in `docs/issues.md`. Two things fail the bar.

1. **The named evidence does not exist.** The bar requires "`docs/issues.md` cross-checked against
   the spec inventory by a script that fails if any inventoried item is missing". Nothing in
   `scripts/`, `tests/` or `package.json` references `issues.md`.
2. **Dispositions are stale, and one is false.**
   - §F claims "`grep -rn '250_000\|250000' src/` returns exactly one line". It returns four, and
     two of them are a live re-implementation of the rule (see R9). The item is marked **Resolved**
     on the strength of a false proof.
   - §E ("two fullscreen implementations") is carried on the reason "The Pricing screen and the
     Structure / Simulator lenses are not built … the rebuild currently has zero implementations",
     and instructs "This row must be re-graded, not assumed, when that lens lands." All three are
     shipped, and `structure.fullscreen.*` is a live parity key.
   - §O3 and §O6 are carried on "The Structure lens is not built" / "The Simulator lens is not
     built".
   - §O9 says the glossary drawer and its 35 terms are "mid-build … Not gradeable against R7 until
     it lands" — it renders 35 cards today.
   - §H says the tab-order walk "is not yet written"; §J says R14's console listener is "still to be
     written". Both exist.
   - §O1 is **Open** on the reason that the `defaultPosition` fixture field "does not exist yet"; it
     is in `data/manifest.json:15` as `"APPOURI"`.

**Fix.** Write the cross-check script the bar names (inventory list → assertion that each item has a
row and a non-empty disposition), re-verify §F's grep, and re-grade E, H, J, O1, O3, O6, O9 against
the shipped code.

### R9 — the materiality rule has three copies, not one
**What is wrong.** `src/domain/exceptions.ts:12-13` is the single definition, and most of the app
uses it. The Excel export does not:

```
src/export/excel.ts:115  : f.nav && Math.abs(f.dNonPos ?? 0) >= 250_000 && Math.abs(((f.dNonPos ?? 0) / f.nav) * 1e4) >= 50
src/export/excel.ts:117    : f.nav && Math.abs(f.dPricing) >= 250_000 && Math.abs((f.dPricing / f.nav) * 1e4) >= 50
```

That is the whole rule — both literals, both magnitudes — written out twice more, in the one place
whose output leaves the building. It also invents its own exception strings ("Material non-position
difference", "Material pricing difference") where the screen chips read "Material non-position gap"
and "Material pricing gap", so the export and the screen disagree in words as well as in
provenance. `src/domain/repricing.ts:276` carries a second copy of a truncation literal
(`.slice(0, 14)`, versus `TRUNCATE.perHolding`/`simHolders` = 14). The rubric's named evidence,
`tests/unit/rules.spec.ts`, does not exist.

**Fix.** Call `isMaterial()` and `EXCEPTION_TIPS`/`groupExceptions` from `excel.ts`; replace
`.slice(0, 14)` with `TRUNCATE.simHolders`; add `tests/unit/rules.spec.ts` that greps `src/` for
each literal and asserts a count of one.

### R10 — "Product NAV" names two different quantities
**What is wrong.** `docs/labels.md` §1 states "Both product NAVs are distinct quantities and are
never given the same label". They are:

- `src/ui/screens/diagnose/structure/index.ts:134` renders `Product NAV $2,062,196,050.07`
  (fund-entity basis) — the label inside the figure element is bare "Product NAV"; the basis sits on
  the following line.
- The Pricing bridge renders `PRODUCT NAV · USD $2,062,198,836` and the Simulator ledger
  `= Product NAV $2,062,198,835.86` (Σ-feeder basis).

So the label resolves to two quantities. Additionally, under the Repriced basis the price table
shows **two** columns, "Repriced mark" and "Repriced unit price", carrying the same value
(`1.011702` for SPORTA) — the `currentPrice` column silently becomes `revisedPrice`, so the current
mark is no longer obtainable and one quantity answers to two labels. The bar's named evidence — a
label→quantity table "machine-checked for uniqueness in both Before and After views" — has no
machine check; `docs/labels.md` §5 still describes a gap that has since been fixed in
`tree.ts:52-60`, which shows the file is not checked against the code.

**Fix.** Render "Product NAV (fund-entity basis)" as the label of the Structure figure, keep the
Σ-feeder one as "Product NAV (Σ top-level feeders)", drop or rename one of the two repriced-price
columns, and add the uniqueness check.

### R12 — the basis control is offered on three screens where it does nothing
**What is wrong.** `renderViewNote` intends to hide the basis where nothing depends on it
(`src/ui/chrome/shell.ts:220-225`), but (a) it only hides the *note*, never the *control*, and
(b) the hiding does not work: `#view-note` gets `hidden = true` while CSS gives `.view-note`
`display: flex`, which overrides the `[hidden]` UA rule — measured `hidden=true`,
`display=flex`, `height=19px` on all three lenses. That is why the committed
`docs/evidence/pricing-basis.json` records `noteVisible: true` for `diagnose-structure`,
`diagnose-ownership` and `diagnose-data-quality`, contradicting the code comment beside it.

`#view-toggle` is visible on all six routes, and on those three lenses flipping it changes nothing:
I compared `#screen` innerText before and after the flip — identical on all three
(`screenChangedByToggle: false`). The bar: "Fails if … the control appears where it does nothing."
The shipped test records `toggleVisible` into evidence and never asserts on it
(`tests/e2e/rubric.spec.ts:196-209`).

Third, the state is named twice, differently, at the same time: the toggle says "Current
marks / Repriced" and the banner says "Before pricing / After pricing" — the vocabulary
`docs/labels.md` says was retired.

**Fix.** Hide `#view-toggle` (not just the note) on the three lenses; use `display: none` for
`[hidden]` or set `.hidden` explicitly; make the banner use the same two words as the toggle; assert
both in the test.

### R13 — the two CSV exports do not agree with the screen
**What is wrong.** The two workbooks are fine and I verified them in both bases: `Summary` carries
Look-through value / Pricing difference / Repriced value / Non-position / NAV, which tie to the
waterfall exactly, and switch correctly under Repriced (`2060610338.29` and `0`); the `Pricing`
sheet's per-fund figures tie to the price table (`1768255188.06`, `1768591226.03`, `336037.97`,
`1.008959`, `1.024650`).

The CSVs fail:

- **Look-through CSV** — byte-identical (18,954 B) in both bases. Under Repriced, its "Look-through
  value USD" column reads `2060224441.40` (product), `291966467.55` (ASCHON), `281726437.96`
  (ASCON) while the screen's column, then headed "Look-through value **at repriced marks**", reads
  `$2,060,610,338`, `$292,016,326`, `$281,776,297`. Three spot figures, three disagreements. The bar
  says "disagrees with the screen by any amount".
- **Send-to-pricing CSV** — 4 columns (`Symbol, Respective Qty, Local Price, Local MV`), of which
  only `Local Price` is rendered on the Pricing screen at the moment of export. `Respective Qty`
  (`1752553740.21`) and `Local MV` (`1795754765.06`) appear in no column of the price table, so
  "at least three spot figures … tie exactly to the figures rendered on screen" cannot be satisfied.

The shipped test asserts only `bytes > 200` (`tests/e2e/screens.spec.ts:140`), and
`tests/e2e/exports.spec.ts` — the file the rubric names — does not exist.

**Fix.** Pass `view` into `exportLookthroughCsv` and emit the basis-appropriate value (and a "Pricing
basis" header row); add units outstanding and value columns to the price table, or drop them from the
price file; write `tests/e2e/exports.spec.ts` that parses each file and compares ≥ 3 cells against
`[data-parity]` values in both bases.

### R14 — one caught error neither surfaces properly nor re-throws
**What is wrong.** `src/ui/screens/diagnose/structure/graph.ts:223-231`:

```
  try { root = d3.stratify…(data); }
  catch { svg.append('text')…text('structure unavailable'); return { nodeCount: 0, … }; }
```

The error object is not even bound, so the cause is unrecoverable; the user gets two words drawn
inside an otherwise empty SVG, with no plain-language explanation and no recovery action — that is
not R4's error state — and nothing is re-thrown, so the headless suite would see a blank graph and a
green run. Given that the fixture contains two circular mappings and 29 dangling SPV codes, a
`stratify` throw is a live possibility, not a theoretical one. Everything else in this criterion
holds: no `console.*` or `alert()` in `src/`, `no-empty` with `allowEmptyCatch: false` at error
level for `src/`, and zero console errors or page errors across every run in this review.

**Fix.** Bind the error, render `errorState(...)` with a recovery ("Reload the structure", or switch
layout), and re-throw or record it so a test can see it.

### R17 — bps is rendered at three different precisions
**What is wrong.** The rubric fixes bps at 1 dp. Rendered:

| Format | Where | Example |
|---|---|---|
| 1 dp, signed, `bps` suffix | `formatBpsOf` — waterfall `waterfall.ts:58,88`, score strip `score-strip.ts:63,78` | `+1.9 bps`, `+7.7 bps` |
| 0 dp, signed, `bps` suffix | `formatBpsCompact` — bridge headline `bridge.ts:88`, per-driver legs `bridge.ts:144` | `+10 bps gap`, `+153 bps`, `-958 bps` |
| 0 dp, **unsigned, no suffix** | `price-table.ts:36-40` (`bps.toFixed(0)`) | `2`, `22`, `0` |

The first two appear on the **same screen**: the Pricing score strip says the pricing gap is
`+1.9 bps` and the bridge, 150 px below, calls the total gap `+10 bps`. `docs/labels.md` §6 carves
out the 0 dp form as "only two places, both inherited" — but it is at least three components and
~30 renderings, and the carve-out itself concedes two precisions for one class, which the bar
forbids ("the same quantity class is rendered at two precisions in two places").

**Fix.** One bps formatter at 1 dp with an explicit sign, used everywhere including the chip and the
bridge; if the compact chip must stay at 0 dp for parity, that is a parity constraint to declare in
`docs/rename-map.json`, not a precision rule.

---

## Caveats on the PASS scores

These passed, but the reader should know what is thin about them.

- **R1.** Every Diagnose lens shows **two** question sentences at once — the Diagnose screen's and
  the lens's — and both carry the class `screen-question`, not `screen-question` + `lens-question`.
  On a lens the second question sits after the entity combobox and the lens tabs, i.e. after two
  controls. I read the criterion as intending exactly this nesting ("each top-level screen **and**
  each Diagnose lens"), with the lens panel as the lens's content region, and scored PASS. A stricter
  reader could fail it on "exactly one visible sentence … before any control".
- **R11.** The fund-entity product NAV lives in a readout whose height is 0 by default
  (`structure.fullscreen.product_nav` is hidden until full screen), so what a controller actually
  reads is `#structure-basis`, which does state both figures and both bases in plain words. The
  shipped test (`tests/e2e/screens.spec.ts:118-126`) reads `textContent` from the hidden node and a
  loose `/fund-entity|entity basis/` regex, and never checks any view-sensitive column header in
  both views — I checked those myself.
- **R15.** I pass this on my own run, not on the shipped one. `tests/e2e/offline.spec.ts` visits the
  six routes and opens the glossary; it exercises **none** of the four exports and not the sources
  drawer, both of which the bar names. I verified them offline directly and they work.
- **R16.** The entity persists everywhere, but the **Data quality lens ignores it**: selecting DUNK,
  CRIMH or SPORTC leaves the KPI at the unscoped `High 31 / Medium 52 / Low 22 / Total 105 — All
  fund entities · scanned universe`, and `#data-quality-scope` is a *separate* combobox that stays
  empty. The lens's own subtitle claims "the selection is shared with every Diagnose lens". That is
  not R16's failure condition ("any lens resets the selection"), so it does not sink the score, but
  it is a defect.
- **R18.** The Simulator's zero-result line "✓ No anomalies for the current selection." offers no
  next action — the direct descendant of the original's `None 🎉` that the criterion criticises. The
  named cases (combobox, filters, unselected lens) all do offer a recovery, so I passed it.

## Other findings, outside the rubric's 18

Recorded because a controller would hit them on day one.

1. **The Ownership identity line renders with no separators**: the five spans of
   `#ownership-identity` concatenate to
   `APPOUR1-SPVAP Pour Holdings, L.P. · code APPOURITotal qty: 1,330,020,204100%`
   (`docs/evidence/review-fold-diagnose-ownership.png`). There is no CSS for `.own-symbol`,
   `.own-name`, `.own-qty` or `.own-pie`.
2. **The Simulator run line renders the same way**: `Repriced value$2.06bnRepricing gain or
   loss+$0.00`.
3. **`docs/issues.md` §M is honoured**: I selected `ABFSUB6` and the lens shows
   `⚠ Ultimate owners sum to 129.29%` with a full explanation, not a green tick. Good, and worth
   saying.
4. **Grammar**: "1 immediate owners" for a single-owner entity (CRIMH).

## What I could not verify, and why

- **Sort-column persistence across screens (part of R16).** I verified expanded tree rows and the
  Pricing filter text survive leaving and returning; I did not construct a sort-then-leave-then-
  return case for every sortable table, so R16's sort clause rests on the store holding
  `pricingSort` rather than on a measurement.
- **A Diagnose lens for an entity with genuinely no data (part of R18).** Every entity I could
  select resolved to data, and the Data quality lens ignores the selection entirely, so I could not
  reach "a lens for an entity with no data". That clause of R18 is unverified in both directions.
- **The `Dynamic` (force-simulation) Structure layout.** I graded the default `Vertical` layout only.
  `docs/issues.md` §O4 says Dynamic is exercised for crash-freedom, never for values; I did not test
  it, so R3/R5/R6 are unscored against it.
- **Whether the `graph.ts:228` catch is reachable with the shipped fixture.** I read the code and
  scored the handler against R14's wording; I did not force `d3.stratify` to throw.
- **The focus-ring contrast figures are computed against each control's own fill.** With
  `outline-offset: 2px` the ring is painted just outside the border box, so the true adjacent colour
  can be the parent's. The 2.81:1 figure is therefore the ring-vs-active-segment reading; the
  clipping finding (no ring drawn at all) does not depend on it.
- **Anything requiring the original to render.** `reference/TRACE-Pro-original.html` needs the two
  cdnjs URLs, which answer 403 through this environment's proxy. I graded the rebuild against the
  rubric, and took the parity gate's own output (1020 keys, 0 diffs) at face value for the *figures*
  only — not for any UX claim.

---

## Verdict

**No. This application does not meet its own rubric.** Thirteen of eighteen criteria fail, and they
are not clerical failures. The four that matter most to a fund controller signing a NAV:

1. **An export disagrees with the screen it was taken from** (R13). Under the Repriced basis the
   look-through CSV ships current-marks values under a column the screen labels "at repriced marks".
   That is a number leaving the building that does not match the number the controller approved.
2. **The materiality rule that decides which funds are flagged has three copies** (R9), one of them
   in the export path, with its own wording for the exceptions. The one defect the rebuild was most
   explicitly asked to remove has been reintroduced in the least visible place.
3. **The as-of date disappears on scroll on five of six screens** (R3), which is the same class of
   defect as the original's collapsible top panel that the rubric was written to prevent.
4. **The controller vocabulary is still undefined** (R2): `NAV`, `SPV`, `VPM`, `px`, `qty` and `MV`
   appear as bare labels, the glossary deep link that was supposed to define them was never wired
   (R7), and the Simulator's help paragraph still names four controls that no longer exist and then
   corrects itself in the next paragraph.

Underneath the individual failures is a pattern the reviewer of the next pass should know about: in
several places the *test* was fitted to what the code does rather than to what the criterion says —
R2's denylist drops 11 of the rubric's 26 tokens; R3 checks one element's visibility instead of every
figure's as-of; R5 asserts `#simulator-runline`, a selector that appears nowhere in the contract
document, and skips the two contract ids that do not exist; R6's walk ignores geometry and contrast;
R13 checks file size. The suite is 41/41 green and the parity gate is 1020/1020 clean, and neither
fact tells you whether the rubric passes. It does not.
