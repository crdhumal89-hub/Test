# First run — the primary answer on every screen

Evidence for rubric **R5**: *"for each screen, the primary answer is named in advance in
`docs/first-run.md`, and is visible on load at 1600×1000 without scrolling and without any click."*

This file names them in advance. The bar it sets is deliberately hard to wriggle out of:

- **One primary answer per screen and per lens**, written as the sentence a controller would say out
  loud. If a screen needs two sentences to say what it answers, it is doing two jobs.
- **Named elements.** Each row lists the selectors that must be inside the 1600×1000 viewport on
  load. `isAboveFold()` in `tests/e2e/helpers.ts` is the assertion; it requires
  `rect.top >= 0 && rect.bottom <= innerHeight && height > 0`, so "technically present" does not
  pass.
- **No instruction, no interaction.** No scroll, no click, no keypress, no search, no tab switch, no
  hover, no tooltip. A figure that only exists in a `title` attribute has not been shown.
- **Never empty on arrival.** Every Diagnose lens must arrive with an entity already selected, so a
  lens is never a blank frame with a search box in it. The seed is `AppState.selectedEntity`,
  set at boot in `src/main.ts` from `StoreInit.defaultPosition` — see the caveat at the end.

Selectors marked **(contract)** belong to a screen or lens that is not built yet
(`docs/ledger.md`). They are the ids that screen must render, chosen so the R5 test can be written
before the screen exists rather than fitted to it afterwards.

Shared chrome must be in the viewport on every screen, because R3 forbids a figure being readable
while its as-of date is not: `#masthead`, `#active-product` (product name), `#asof` (the as-of date,
never collapsible), `#view-toggle` (which pricing basis is active), and `#screen-nav`.

---

## 1. Reconciliation — the landing screen

**Question rendered:** "Does this product's NAV agree with the value of what it holds, and where is
the difference?" (`RECONCILIATION_QUESTION`, `src/ui/screens/reconciliation/index.ts`)

**Primary answer: whether NAV ties, and by how much.**

A controller who opens the app and reads nothing else must come away with: it ties (or it is off by
$X), and the difference splits into $A of pricing and $B of cash-and-fees.

| Must be in the viewport on load | Selector | Carries |
|---|---|---|
| The tie verdict | `#reconciliation-waterfall .wf-tie-pill` | `✓ ties to the cent`, or `residual ($X)` |
| The whole additive statement, all five steps | `#reconciliation-waterfall .wf-step`, `.wf-op` | look-through value → pricing difference → repriced value → non-position difference → NAV |
| NAV itself, with its basis | `[data-parity="reconciliation.waterfall.nav"]` and its `.wf-basis` | `$2,062,198,836`, "sum of top-level feeder NAVs · as of 2026-06-30" |
| The two differences, in dollars and bps | `[data-parity="reconciliation.waterfall.delta_pricing_usd"]`, `…delta_pricing_bps`, `…delta_nonposition_usd`, `…delta_nonposition_bps` | the size and materiality of each driver |
| How many funds are flagged, and with what | `#reconciliation-exceptions .chip` | one chip per exception category, count first |
| The question line | `#reconciliation-question` | first text in the content region |

**Not the primary answer, and may sit below the fold:** the 149-row hierarchy
(`#reconciliation-tree`), the help paragraph, and the per-row drawer.

**Fails if:** the tie pill or NAV requires a scroll; the waterfall renders before its data and shows
a dash; or the exception chips are only reachable after expanding something.

## 2. Pricing

**Question rendered:** "What unit price do I publish for each fund today, and what does repricing do
to value?" (`PRICING_QUESTION`, `src/ui/screens/pricing/index.ts`)

**Primary answer: the price to publish for each top-level feeder, and what repricing costs in
total.**

The deliverable of this screen is a price file. The first thing on it must therefore be prices, not
a chart of prices.

| Must be in the viewport on load | Selector | Carries |
|---|---|---|
| The question line | `#pricing-question` | one sentence, before any control |
| The total repricing P&L and its bps | `[data-parity="pricing.score.delta_pricing_usd"]` and `…delta_pricing_detail`, in `#pricing-score` | what repricing does to product value |
| NAV, so the P&L has a denominator | `[data-parity="pricing.score.nav"]` | the `= NAV · USD` tile |
| The flagged-fund count | `[data-parity="pricing.score.nav_detail"]` | how many funds carry a material gap |
| At least the first five funds' price to publish, at 6 dp | `#pricing-price-table tbody tr` rows 1–5, cell `[data-parity^="pricing.fund."][data-parity$=".publish_px"]` | `NAV ÷ units` per fund |
| Which basis produced these prices | `#view-note` | "Current marks" or "Repriced", in words |

**Not the primary answer:** the valuation bridge (`#pricing-bridge`), the Repricing Walk
(`#pricing-walk-table`, hidden on load), per-holding P&L, and the export buttons. The walk is the
*second* view of this screen and must not be what loads.

**Fails if:** the screen opens on the bridge or on the walk; if the publish-price column is
horizontally scrolled out of view; or if the price column is sorted such that no top-level feeder
appears in the first rows.

**Live risk on this screen:** `mountPricing` renders in the order question → tools → score strip →
narrative banner → bridge → help → price table. At 1600×1000 the bridge sits between the strip and
the first price row, so the publish prices are the figure most likely to fall below the fold. If they
do, the fix is layout, not a rewrite of this file: the primary answer is the prices.

## 3. Diagnose

**Question rendered:** "Why is this entity off — how is it wired, who owns it, is its data sound,
and what happens if it moves?" (`DIAGNOSE_QUESTION`, `src/ui/screens/diagnose/index.ts`)

**Primary answer: which entity is under examination, and which of the four lenses is looking at
it.**

Diagnose has no answer of its own — its four lenses do. What it owes a first-run reader is the
subject and the choice of instrument, both without a click.

| Must be in the viewport on load | Selector | Carries |
|---|---|---|
| The question line | `#diagnose-question` | |
| The entity under examination, already populated | `#diagnose-subject`, `#diagnose-entity` | symbol, code and name of the pre-selected entity — never an empty search box |
| The four lenses, with the active one marked | `#lens-tabs [role="tab"]` | Structure · Ownership · Data quality · Simulator |
| The active lens's own question | `#lens-question` | the sentence for the lens below |

**Fails if:** the entity combobox is empty on arrival, or the lens tabs need a scroll.

### 3a. Structure lens

**Question rendered:** "How is this product wired — who owns whom, and where is concentration?"
(`STRUCTURE_QUESTION`, `src/ui/screens/diagnose/structure/index.ts`)

**Primary answer: the shape of the product, one level down, with the biggest holding visible.**

| Must be in the viewport on load | Selector | Carries |
|---|---|---|
| The question line | `#structure-question` | |
| The graph, laid out, with the product node and its top-level feeders drawn | `#structure-stage` (and its `svg`) | node area ∝ look-through value; ownership % on each edge |
| Where value is concentrated, **in words** | `#structure-caption` | entity count, link count, depth, and "X% of the product's look-through value sits under *code*" — the text alternative for the graph, so the answer does not depend on reading a picture |
| The layout and legend controls | `#structure-controls` | Vertical is the default; Dynamic is opt-in |

Not part of the above-the-fold answer, but required for R11: `#structure-basis` (below the stage)
states both product NAVs and why they differ, and `#structure-readout` — hidden until the stage takes
the viewport — carries `Product NAV $2,062,196,050.07` explicitly labelled *fund-entity basis*, the
$2,785.79 counterpart of the waterfall's Σ-feeder figure (`docs/issues.md` §L).

**Fails if:** the graph is still simulating when read (Vertical, not Dynamic, is the default for
exactly this reason — `docs/redesign-spec.md` §5.4), or a product NAV appears anywhere without its
basis.

### 3b. Ownership lens

**Question rendered:** "Who ultimately owns this position, and in what proportion?"
(`OWNERSHIP_QUESTION`, `src/ui/screens/diagnose/ownership/index.ts`)

**Primary answer: whether the owners of this position add up to 100%, and who the biggest owner
is.**

| Must be in the viewport on load | Selector | Carries |
|---|---|---|
| What is being decomposed | `#ownership-identity` | symbol · name · code · kind, and total units outstanding |
| The conservation verdict | `#ownership-checks` | `✓ Owners reconcile to 100%` / `✓ Ultimate owners = 100%` — **or the real figure**, e.g. `⚠ Ultimate owners sum to 129.29%` for `ABFSUB6`. A green tick over a non-conserving entity is a FAIL, not a pass (`docs/issues.md` §M) |
| The proportional ribbon | `#ownership-ribbon` | up to 40 segments, largest first |
| The count line | `#ownership-status` | n immediate owners · n ultimate parents · top-5 share |
| The first owner rows | `#ownership-tree` rows 1–5 | units held · direct share · cumulative share |

**Fails if:** the integrity check is below the owner table (a controller must see the verdict before
the evidence), or the lens opens with nothing searched.

### 3c. Data quality lens

**Question rendered:** "What is wrong with the source data before I trust any figure above?"
(`DATA_QUALITY_QUESTION`, `src/ui/screens/diagnose/data-quality/index.ts`)

**Primary answer: how many data defects exist, at what severity, and in which five categories.**

| Must be in the viewport on load | Selector | Carries |
|---|---|---|
| The question line | `#data-quality-question` | |
| The four counts | `#data-quality-kpi` | High · Medium · Low · Total (105 unscoped) |
| The active scope | `#data-quality-scope` | "All fund entities · scanned universe", or one entity's reachable world |
| All five buckets, with count and severity, collapsed | `#data-quality-buckets` | Self-mapping 43 Medium · Circular mapping 2 High · Missing / dangling SPV 29 High · Incomplete look-through 9 Medium · Unmapped identifiers 22 Low |

**Fails if:** any bucket's count requires expanding the accordion, or the total is shown without its
severity split.

### 3d. Simulator lens

**Question required:** "If this fund's value or units move, what happens to product NAV, and
through which holders?" (`LENS_QUESTION.simulator`)

**Primary answer: the resting state — what product NAV and this entity are worth *before* any
shock — and where to type the shock.**

A simulator's first-run answer cannot be a result, because no shock has been entered. It is the
baseline plus the way in.

| Must be in the viewport on load | Selector | Carries |
|---|---|---|
| Product NAV, unshocked, with its basis | `#simulator-baseline` **(contract)** | the figure any Δ will be measured against |
| The selected entity's current value and unit price | `#simulator-subject` **(contract)** | what is about to be shocked |
| The three shock inputs and Run, without opening a panel | `#simulator-shock` **(contract)** | value / units / NAV shock · Run · Reprice everything (bottom-up) |
| The stage with the selected node visible and marked | `#simulator-stage` **(contract)** | the path a shock will travel |

**Fails if:** the shock panel starts collapsed behind a handle, or product NAV is only shown after a
run completes.

## 4. Drawers

Neither drawer is a screen and neither owns a primary answer, but both are part of first-run
reachability:

- **Glossary** — one action from every screen: the `#open-glossary` button in the masthead, or the
  `G` key (`wireShell`, `src/ui/chrome/shell.ts`). Opening it must not discard the selected entity
  or the screen state (R7, R16).
- **Data sources & as-of** — `#open-sources`, one action, carrying which report each figure came
  from and as of when.

---

## Keeping the test in step with this file

`tests/e2e/rubric.spec.ts` (test "R5 — the primary answer is above the fold on load, with no click")
holds one selector per route and says in a comment that it is kept in step with this file. It is the
machine half of the same contract, so the two must agree. As of writing they do not, and the
mismatch is in the test rather than here:

| Route | Selector the test asserts | Rendered? |
|---|---|---|
| `reconciliation` | `[data-parity="reconciliation.waterfall.nav"]` | yes |
| `pricing` | `[data-parity="pricing.score.nav"]` | yes |
| `diagnose-structure` | `.graph-stage, .graph-caption` | **no** — those two classes exist only in `components.css`; the elements rendered are `#structure-stage` and `#structure-caption` |
| `diagnose-ownership` | `.integrity` | **no** — CSS-only class; `#ownership-checks` renders `.chip` children |
| `diagnose-data-quality` | `.kpi-row` | **no** — CSS-only class; the element rendered is `#data-quality-kpi` |
| `diagnose-simulator` | `.graph-stage, .score-strip` | `.score-strip` is real (it is the Pricing screen's strip class); the simulator lens is not built |

Three of the six will fail on a selector, not on a layout. Fix the selectors to the ids listed in the
tables above; do not relax `isAboveFold`.

## Caveat that must close before this file can be scored

`src/main.ts` currently seeds `defaultPosition` from the first `kind === 'vehicle'` node of the
look-through tree, which resolves to **`ASCON`**. `tests/baseline.json` pins the Ownership lens on
**`APPOURI`**, which is not in that tree at all — it is in `universe.json`. Whatever seed is chosen
must (a) be non-empty, so no lens is ever blank on arrival, and (b) be a fixture field rather than a
code path, per `docs/redesign-spec.md` Q5. Tracked as `docs/issues.md` §O1.
