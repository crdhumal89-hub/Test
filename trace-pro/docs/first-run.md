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

Selectors were marked **(contract)** while a screen or lens was unbuilt (`docs/ledger.md`) — the ids
that screen must render, chosen so the R5 test could be written before the screen existed rather than
fitted to it afterwards. **All of them now render**, and no table below carries a `(contract)` marker
any longer — the last two, on the Simulator rows, went when those two elements landed. The
substitution stays auditable through the dated amendment notes that record each one rather than
through the markers themselves: `grep -n '(contract)' docs/first-run.md` returns this paragraph and
those notes, and no table row.

Shared chrome must be in the viewport on every screen, because R3 forbids a figure being readable
while its as-of date is not: `#masthead`, `#active-product` (product name), `#asof` (the as-of date,
never collapsible) and `#screen-nav`.

**Amended 2026-08-04 (R3):** "in the viewport on load" was too weak for what R3 actually says — "a
persistent chrome element visible *simultaneously* with it". Unpinned, the masthead left the viewport
after 563px of scrolling on Pricing while 146 figures were still readable. `.masthead` is therefore
`position: sticky; top: 0` (`src/ui/styles/app.css`), and the R3 test scrolls each route to its bottom
and requires the as-of to be readable at every step where a figure is.

`#view-toggle` is **deliberately not** in that list. R12 requires the basis control to be absent where
no figure depends on it, so it is hidden on Structure, Ownership and Data quality. Where it is shown,
it is in the sticky masthead and therefore cannot scroll away either.

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

**The live risk on this screen materialised, and was fixed as this file said it should be.**
`mountPricing` renders question → tools → score strip → narrative banner → bridge → help → price
table. At 1600×1000 the 255px bridge and the 94px help paragraph pushed the first publish price to
y=887 and rows 2–5 below the fold — exactly one row of five. **The fix was layout, not a weaker
selector:** `#screen` becomes a flex column and `#pricing-bridge` and `#pricing-help` are given a
later `order` than `#pricing-price-table` (`src/ui/styles/components.css`). Nothing in the markup
moves, no text changes, DOM order is untouched (so R1's "first text in the content region" still
holds) and the bridge is one short scroll below the prices where this file always said it belonged.
Measured after: rows 1–5 at y=582…750, fourteen publish prices above the fold.

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
| The active lens's own question | `#structure-question` / `#ownership-question` / `#data-quality-question` / `#simulator-question` | the sentence for the lens below |

**Amended 2026-08-04 (R5); the amendment note itself corrected since.** The row above used to name a
single id, `#lens-question`. This note used to say in bold that no element with that id had ever been
rendered. **That was false.** The id existed and was then deleted, and the history says so in one
command:

```
$ git log --all --oneline -S"id: 'lens-question'" -- trace-pro/src
b01ccd3 Phase 2 (5/n): all three screens wired, exports built, four agent findings fixed
7752a15 Phase 2 (3/n): parity tagging, Diagnose shell, combobox, component styles
```

`7752a15` **added** it: `mountDiagnose` rendered `el('p', { class: 'lens-question', id:
'lens-question' })` between the lens tabs and the lens body, and `renderLens` filled it on every
switch with `qs('#lens-question', host).textContent = LENS_QUESTION[lens]`. `b01ccd3` **removed** it,
deleting the element and the `LENS_QUESTION` record together when each lens took ownership of its own
question — the comment that replaced it still stands at `src/ui/screens/diagnose/index.ts:44`: *"No
question line here: each lens renders its own as the first text in its content region, which is where
R1 requires it. Two copies of the same sentence is worse than one."* So the contract named an id that
had been **deleted**, not one that never existed — and it was `b01ccd3` that deleted it, in the same
commit that created this file naming it (`git show b01ccd3:trace-pro/docs/first-run.md | grep
lens-question` → *"| The active lens's own question | `#lens-question` | the sentence for the lens
below |"*). The contract was written against the shell as it stood minutes earlier and not re-read
after the same change moved the question into the lenses.

The conclusion is unchanged, and this is still a correction rather than a weakening. The four per-lens
ids do render (`mountStructureLens`, `mountOwnershipLens`, `mountDataQualityLens`,
`mountSimulatorLens`, each `class: 'screen-question'` with its own id) and each is above the fold:
`tests/e2e/rubric-order.spec.ts` requires a `.screen-question` / `.lens-question` element to be the
first text painted on all six routes and inside the first 400px, and R5's own table in
`tests/e2e/rubric.spec.ts` names `#structure-question` and `#data-quality-question` outright. What made
the phantom plausible is that the rule outlived the element: `.lens-question` is still declared at
`src/ui/styles/components.css:82` and still matched by those test selectors, while nothing renders the
class — `grep -rn 'lens-question' src/` returns that one CSS line and nothing else. Renaming the four
ids to one would mean editing `diagnose/index.ts` and all four lens files; if that is preferred it is a
separate change, in files this pass does not own.

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

**Amended 2026-08-04 (R5), values corrected since.** `#structure-stage` carries an inline
`height: 640px`, which put the bottom of its `svg` at 1195 — 195px past the fold. It is clamped with
`max-height`, because an inline `height` cannot be beaten by a stylesheet without `!important`, which
is banned. The clamp is **`max-height: 40vh`** and it lives in **`src/ui/styles/lenses.css:23`**, not
the 42vh in `components.css` this note first recorded: `c354df9` moved the four lens sections out of
`components.css` when it hit 403 lines, and `ccb2a6e` cut 42vh to 40vh because the R2 vocabulary line
took 17px of the room below the caption and left the stage bottom at 996 of 1000 — passing by 4px,
which is not a margin. The reasoning is in the rule's own comment. Full screen is exempt via
`#structure-stage[style*='position:fixed']` (`lenses.css:24`), so the `structure.fullscreen.*` parity
scene is unaffected. The `svg 560…978` measured here was taken at 42vh, before `ccb2a6e`; the current
geometry is asserted by the R5 test rather than re-quoted, because this pass could not run the browser.

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

**Amended 2026-08-04 (R5/R6).** `#ownership-ribbon` measured **0px high**: `owner-tree.ts` renders
`.own-ribbon` / `.own-seg`, and neither class had a single line of CSS. So the primary answer this row
names was invisible, *and* its 39 segments were 39 zero-height tab stops for R6. Both classes are now
styled at `src/ui/styles/lenses.css:107-119` (this note first said `components.css`; `c354df9` split
the lens sections out of it) — an 18px strip, `min-width: 5px` per segment so the smallest holder is a
real target, and no `overflow: hidden` on the strip, because that is precisely what erased the focus
ring on the pricing-basis control. Three of the eight segment colours were also lightened past the
point where a focus ring could contrast with them and have been darkened (`owner-tree.ts`). The
identity line above it, which concatenated to `…code APPOURITotal qty: 1,330,020,204100%`, is styled
too. Measured then: ribbon 433…451 — 18px, which is the strip height the stylesheet still sets — 40
segments, every one ≥ 5×16px with a 3.28:1 ring or better. The vertical position predates the
vocabulary line `ccb2a6e` added to this lens; the strip's own dimensions are unchanged.

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

**Question rendered:** "If this fund's value or units move, what happens to product NAV, and
through which holders?" (`SIMULATOR_QUESTION`, `src/ui/screens/diagnose/simulator/intro.ts` — the
`LENS_QUESTION.simulator` this row used to cite was the shell's record, deleted with `#lens-question`
in `b01ccd3`)

**Primary answer: the resting state — what product NAV and this entity are worth *before* any
shock — and where to type the shock.**

A simulator's first-run answer cannot be a result, because no shock has been entered. It is the
baseline plus the way in.

| Must be in the viewport on load | Selector | Carries |
|---|---|---|
| Product NAV, unshocked, with its basis | `#simulator-baseline` | `$2,062,198,835.86` · "United States dollars · Σ top-level feeder NAV · the unshocked baseline every Δ below is measured against" |
| The selected entity's current value and unit price | `#simulator-subject` | symbol · value · price per unit · name, code and effective share |
| The three shock inputs and Run, without opening a panel | `#simulator-shock`, and inside it `#simulator-shock-mv`, `#simulator-shock-qty`, `#simulator-shock-nav`, `#simulator-run` | value / units / NAV shock · Run cascade · Reprice everything (bottom-up) |
| The stage with the selected node visible and marked | `#simulator-stage` | the path a shock will travel |

**Fails if:** the shock panel starts collapsed behind a handle, or product NAV is only shown after a
run completes.

**Amended 2026-08-04 (R5).** The two **(contract)** markers are gone because the elements now exist.
Three things were wrong and all three are fixed in `simulator/index.ts` and, since `c354df9` split it
out of `components.css`, `src/ui/styles/lenses.css`:

1. `#simulator-baseline` and `#simulator-subject` **were never rendered at all**. They are now the two
   tiles directly under the lens question — the resting state, which is the only honest first-run answer
   for a simulator, since no shock has been entered.
2. `#simulator-shock` sat at y=1333, below a 620px stage and two help paragraphs. The stage is
   **392px** (`SIMULATOR_STAGE_STYLE`, `simulator/index.ts:33`; it was the 440px this note first
   recorded, then 420 in `c354df9`, and `51afda5` took it to 392 so Run's bottom cleared 1000 once the
   R2 vocabulary line landed above it) and the shock panel sits **beside** it, in a
   `minmax(320px, 34%)` column (`lenses.css:68`); the run line, the caption and the two help paragraphs
   moved below the scene. They are the graph's text alternative and the erratum on the two renamed
   sweep controls — not the first-run answer, and the run line is not named in this file.
3. The lens arrived saying "Nothing selected yet" while the Diagnose subject bar read `APPOURI`,
   because `APPOURI` is a universe position and not a fund in this product's cascade. The lens now
   falls back to the largest top-level feeder (`SPORTHLD`, 87% of product NAV) when the shared
   selection is not shockable here. It does **not** write to the store, so the selection the other
   three lenses share is untouched (R16) — see the caveat at the end, which this narrows but does not
   close.

The contract row asserts the four inner control ids as well as the panel, because a panel that is
technically in the viewport while its inputs are not would satisfy the letter and not the bar. Measured
after, at the 440px stage this note was written against: baseline and subject 419…490, stage 543…983,
market-value input 817…845, Run 917…945. `51afda5` re-cut the stage to 392px and its own comment records
the replacement geometry (panel bottom 974, Run 955); these four ranges are not re-measured here,
because this pass could not run the browser.

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

**Closed 2026-08-04.** The mismatch recorded here — the test asserting one selector per route, and
asserting `#simulator-runline` for the Simulator, which no table in this document names — is gone.

*Correction to this paragraph.* It used to say that three of those six selectors were "CSS-only classes
that were never rendered". That was false. `git show 1b630d2^:trace-pro/tests/e2e/rubric.spec.ts` shows
the six were two `[data-parity]` attribute selectors plus `#structure-caption`, `#ownership-checks`,
`#data-quality-kpi` and `#simulator-runline` — four ids, no classes — and `git grep "id: '<id>'"
1b630d2^ -- trace-pro/src` finds every one of the four rendering at that commit, as all four still do.
The defect was that one selector per route is not the primary answer this file names; it was not that
the selectors were phantoms.

`tests/e2e/rubric.spec.ts` now holds a `FIRST_RUN` table whose rows are **the rows
of the tables above**, selector for selector, with a count where this file says "the first five", plus
`CHROME_ROWS` for the shared chrome and `DIAGNOSE_ROWS` for the Diagnose shell. Every one of them is
asserted with `rect.top >= 0 && rect.bottom <= innerHeight && height > 0` and, at the end of each route,
`window.scrollY === 0`, so nothing can pass by having been scrolled into view.

For the record, because this is the third time these selectors have moved: the previous two passes
changed the *test* to match whatever the app already did. This pass changed the *app*. The only edit to
the contract is the `#lens-question` → four per-lens ids correction above, which names elements that
ship instead of one that `b01ccd3` had deleted, and the Simulator rows, which lost their `(contract)`
markers because the elements they name now exist. No selector was replaced with a looser one and `isAboveFold`
was not relaxed.

| Route | What the test asserts now | Count |
|---|---|---|
| every route | `#masthead`, `#active-product`, `#asof`, `#screen-nav` | 4 |
| `reconciliation` | question, tie pill, five waterfall steps, NAV, NAV basis, both differences in $ and bps, three exception chips | 10 rows |
| `pricing` | question, repricing P&L and its bps, NAV, flagged count, **five** price rows, **five** publish prices, `#view-note` | 8 rows |
| `diagnose-*` | `#diagnose-question`, `#diagnose-subject`, `#diagnose-entity`, four `#lens-tabs [role="tab"]` | 4 rows |
| `diagnose-structure` | `#structure-question`, `#structure-stage svg`, `#structure-caption`, `#structure-controls` | 4 rows |
| `diagnose-ownership` | `#ownership-identity`, `#ownership-checks`, `#ownership-ribbon`, `#ownership-status`, **five** `#ownership-tree tbody tr` | 5 rows |
| `diagnose-data-quality` | `#data-quality-question`, `#data-quality-kpi`, `#data-quality-scope`, `#data-quality-buckets` | 4 rows |
| `diagnose-simulator` | `#simulator-baseline`, `#simulator-subject`, `#simulator-shock`, its three inputs, `#simulator-run`, `#simulator-stage` | 8 rows |

## Caveat that must close before this file can be scored

`src/main.ts` seeds `defaultPosition` from `data/manifest.json`, which names **`APPOURI`** — the same
position `tests/baseline.json` pins the Ownership lens on. That satisfies (a) non-empty and (b) a
fixture field rather than a code path (`docs/redesign-spec.md` Q5). `docs/issues.md` §O1 is now
dispositioned against that field; its earlier reason — that the fixture field did not exist yet, and
that the seed resolved to `ASCON` — was stale and has been corrected there.

**What is left, narrowed 2026-08-04.** `APPOURI` is a firm-wide universe position, not a fund in this
product's cascade, so it is not a *shockable* subject. The Simulator lens handles that locally, without
writing to the store, by falling back to the largest top-level feeder — so no lens is blank on arrival.
It remains true that one seed is being asked to serve two different entity namespaces, and the clean fix
is a second manifest field (a shockable default, e.g. `defaultShockSubject`) read in `src/main.ts`.
**That is in `data/manifest.json` and `src/main.ts`, neither of which this pass owns**, so it is reported
rather than done.
