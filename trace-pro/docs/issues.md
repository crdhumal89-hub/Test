# Defect register — everything found in the original, and what happened to it

Evidence for rubric **R8** ("every defect found in the original is resolved or carried with a
reason"). The inventory is `docs/redesign-spec.md` §1.1–1.7 and §1.8. Nothing from that inventory
is omitted here; where an item is still open it says so, with an owner.

**How to read a row.**

- **Resolved** — the condition does not exist in the rebuild, and the row names the file (or the
  machine check) that proves it.
- **Carried** — the condition still exists, deliberately, with a reason and an owner. "Carried" is
  never a synonym for "forgotten": four of the carried items below are carried *because* changing
  them would change a reported figure, which this run is forbidden to do.
- **Open** — needs a decision from an owner outside this rebuild. One row (O1) plus the two unassigned
  data referrals in §L and §M; the standing count at the foot of the file is the list.

Original under study: `reference/TRACE-Pro-original.html`, 934,142 bytes, 2,520 lines, read-only.
Line numbers below are lines of that file and were re-verified against it for this document, not
copied from the spec.

Machine checks quoted here were run on the working tree at the time of writing:

```
$ node scripts/check-limits.mjs
checked 34 files (20 shipped UI sources)
  top-level identifiers in src/: 179, all unique
  inline on*= attributes: 0
  !important declarations: 0

STRUCTURE CHECK PASSED
```

(The file and identifier counts rise as screens land — two runs an hour apart during this revision
reported 102 then 105 files and 557 then 564 identifiers — so no snapshot of them stays true and none is
quoted as current. What this register turns on is invariant and was re-measured: "all unique", inline
`on*=` **0**, `!important` **0**, `STRUCTURE CHECK PASSED`.)

---

## A. Dead code — 5 bindings, never called

| Binding | In the original | Disposition |
|---|---|---|
| `PF` | line 881, `let PF=PRICING.funds||{}` — declared, never read | **Resolved** — not ported. `grep -rn '\bPF\b' src/` returns nothing. |
| `Q` | line 892, a 2dp number formatter, never called | **Resolved** — not ported. `src/domain/money.ts` carries only formatters something renders. |
| `vchip` | line 1067 — builds a `.vchip` badge; never called, though its `.vchip / .v-hi / .v-md / .v-lo` CSS is live | **Resolved** — neither the function nor the orphan CSS was ported. |
| `ragc` | line 1305 — bps → rag colour class | **Resolved** — not ported. The severity bands live once, as `WARN_BPS` / `BAD_BPS` in `src/domain/exceptions.ts`. |
| `recActive` | line 1306 — `REVISE.funds.filter(f=>f.hasNav)` | **Resolved** — not ported; callers filter at the point of use. |

Approved as Q2 in the spec: delete the dead *code*, keep the dead *data*.

## B. Dead data

`EMB.recon` — 23 rows of product-vs-external ownership reconciliation, computed by the original
and rendered nowhere (`MODEL.recon` has zero references). **Carried — data of record**, copied
faithfully into `data/.../lookthrough.json`. Owner: the upstream extract.
 — fields nothing reads

**Carried, by decision.** Fixtures are data of record and are copied byte-faithfully, dead fields
included, because pruning would be a judgment call about someone else's data on a run whose
contract is "do not change a single figure" (spec §5.2, Q2). Every field below is listed in
`data/README.md` under "Fields nothing reads", and `npm run fixtures:check` asserts the fixtures
still deep-equal the original, so none of them can silently drift or disappear.

| Fixture (was) | Unread fields | Verified present |
|---|---|---|
| `lookthrough.json` (`EMB`) | `recon` — 23 rows of product-vs-external ownership reconciliation, rendered nowhere; `dcN` = 2,061,528,573.10 (a double-count total belonging to the *sibling* TRACE module, not this one); `resid` = −1,971,608.67; `bps` = −9.5607; `apexPos` = 2,061,831,574.92; `grandVar` = −1,607,133.52 | yes — 23 rows, all six scalars |
| `legacy-pricing.json` (`PRICING`) | 7 top-level fields: `lookthroughNAV`, `derivedTotal`, `positionTotal`, `repricingPnL`, `priceableCount`, `missingNav`, `fxFunds` | yes, all 7 |
| `legacy-pricing.json` → `recon` (`REC`) | 5 fields: `grossNonTrade`, `grossLT`, `net`, `apexNAV`, `productName` | yes, all 5 |
| `universe.json` (`UNI`) | `counts` = `{funds:2471, edges:1382, investees:514, securities:13253, selfloops:64, iters:6}` | yes |
| `repricing.json` (`REVBASE`) | `maxlevel` = 6 | yes |
| `simulator.json` (`SIM`) | `maxlevel` = 6 | yes |

Owner: whoever owns the pipeline that emits these blobs. Nothing in this repo consumes them, and
nothing in this repo may delete them.

**Found while verifying, not in the spec:** `UNI.counts.selfloops` = **64**, but the Issue Log's
self-mapping bucket has **43** rows, and `UNI.edges` as shipped contains **0** self-referencing
edges (`node scripts/audit-ownership.mjs`). Three numbers describing one condition, two of them
dead. Recorded here so the discrepancy is not discovered again from scratch; it changes nothing on
screen, because `counts` is never rendered. Owner: the upstream data owner, with §B.

## C. Two dead DOM ids, destroyed on first render

`id="lth-live-s"` and `id="lth-dp-s"` ship in the markup inside the two column headers that
`renderTree()` (line 1092) rewrites: the render sets `lth-live` / `lth-dp` `.innerHTML`, which
destroys the `-s` children on the very first paint. Dead ids in shipped markup.

**Resolved.** `grep -rn 'lth-' src/` returns nothing. Column labels and their sub-labels are
declared once, as data, in `TREE_COLUMNS` in `src/ui/screens/reconciliation/tree.ts`, and the
header is rendered from that array — there is no element to destroy and no second place to update.

## D. Two parallel reconciliation engines, one of them invisible

`REC` (from `PRICING.recon`) and `REVISE` (from `REVBASE`) both compute a reconciliation. Only
`REVISE` renders. `REC` survives as a bag of five useful things — `warnBps`, `badBps`, `product`,
`ltvByCode` and the NAV-upload pipeline — while `recFlag()`, `buildBridge()` (line 1396) and
`parsePivot()` still compute the *old* model's gaps, and `recomputeRFX()` maintains `REC.bridge`
and `REC.nFlagged` that nothing displays.

**Carried, with a plan and a sequence** (spec Q3). There is now exactly one reconciliation model in
the rebuild — `src/domain/repricing.ts` plus `src/domain/reconciliation.ts` — and no second engine
was ported. `legacy-pricing.json` is still loaded (`src/data/load.ts`), and the only current reader
is the glossary's worked examples (`src/glossary/terms.ts`, `recon.sumAllFundNAV`).

Deletion of the legacy path is deliberately scheduled **last**, after parity is green everywhere
else, because `parsePivot` / `applyRawFeedToREC` carry hard-won robustness (the
`PREV_DAY_ENDING_NAV` trap, non-breaking-space-dirty fund codes) that must be unit-tested *before*
it is deleted, not after. Owner: the rebuild engineer; tracked as the last item of the Phase 2
sequence in `docs/ledger.md`.

## E. Two independent fullscreen implementations

`#rfxfull` on the Pricing screen toggles `body.rfxfs`. The Structure and Simulator screens use the
entirely separate `GMAX` subsystem (~25 `gmax*` functions from line 2131). Two mechanisms, one
behaviour.

**Resolved — one mechanism, re-graded against the built lens.** This row previously said the rebuild
had *zero* implementations, on the strength of `grep -rni 'fullscreen|rfxfs|gmax' src/` returning
nothing. That grep is a literal string search, not an alternation — `grep -rniE` is the command, and it
returns four lines, all in `src/ui/screens/diagnose/structure/index.ts`. There is exactly one
implementation:

- `toggleFull` in `structure/index.ts` swaps the stage's inline style for `STRUCTURE_FULLSCREEN_STYLE`
  (`index.ts:48`, `position:fixed;inset:0;width:100vw;height:100vh`), reveals `#structure-readout`, and
  flips the button's `aria-pressed`; `src/ui/styles/lenses.css:24` exempts that state from the stage's
  40vh clamp. The parity scene reaches it through `data-parity-scene="step:stageFullscreen:str"`
  (`scripts/lib/steps.mjs:106`).
- Nothing else in `src/` has a full-screen control: `rfxfs` and `GMAX` have no counterpart, and the
  Pricing screen and the Simulator lens have none — `grep -rniE 'fullscreen|rfxfs|gmax' src/` finds no
  hit outside that one file.

So the defect — two mechanisms for one behaviour — is gone, at one mechanism rather than none. Two
things are worth stating rather than implying: the code sits inline in the Structure lens, not in the
single `stageFullscreen.*` module the spec named (§3.2), and the Simulator's full screen was not carried
over at all, which is a scope fact and not a fix. Owner: the rebuild engineer, if the module boundary is
wanted.

## F. Four independent copies of the materiality rule

`|gap| ≥ $250,000` **and** `|bps| ≥ 50 bps`, written out four times: `ltFlag()` line 1082,
`ltFundFlags()` 1109, `renderScore()` 1316, `rfxFlag()` 1353. Changing the firm's tolerance meant
finding all four.

**Resolved.** One definition, in `src/domain/exceptions.ts`:

```
export const MATERIAL_USD = 250_000;
export const MATERIAL_BPS = 50;
```

`grep -rn '250_000\|250000' src/` returns **two** lines, and only one of them is executable:
`src/domain/exceptions.ts:12` above, plus `src/glossary/terms-nav.ts:120`, where the threshold appears
inside an `alsoFind` search-alias string on the glossary card that defines the rule. A card that *states*
the rule is documentation, not a second copy of it, which is why `scripts/check-issues.mjs` skips
`src/glossary/` when it enforces "one definition" and why `tests/unit/rules.spec.ts` asserts the floor
"appears in exactly one executable place in `src/`". The warn/bad bps bands (`WARN_BPS` 25,
`BAD_BPS` 50) and every top-N truncation the original scattered inline (8, 10, 14, 40, 200, and the
simulator's 8 / 14) are likewise single-sourced there, as `TRUNCATE`.

## G. Five identifier collisions by shadowing

| Name | Collisions in the original | Became |
|---|---|---|
| `LTV` ×4 | function at 1058; `const` at 1396; `const` at 1409; nested function at 2043 | `lookThroughValue` (`src/domain/lookthrough.ts`) / `derivedByCode` |
| `walk` ×2 (+ a view id) | nested at 1060 (tree descent) and 1159 (owner ascent) — two unrelated algorithms; plus `walk` as a view name at 1526 | `walkLookthroughTree` / `walkOwnersUpward` / the view id `'walk'` in `AppState.pricingSubview` |
| `N` ×2 | count formatter at 891, shadowed by a NAV local at 1988 | `formatCount` (`src/domain/money.ts`) |
| `P` ×2 | percent formatter at 893, shadowed at 1252 (`strParams()`) and again at 1591 (a loop variable over parents) | `formatPercent` |
| `CUR` ×2 | selected position code at 1157, shadowed by an Excel number format at 931 | `selectedPositionCode` → `AppState.selectedEntity`; the number format is local to the export module |

**Resolved and machine-enforced.** `scripts/check-limits.mjs` fails the build if any name is
declared at top level in two modules under `src/`; the run quoted above reports "179, all unique".
The rename table is `docs/redesign-spec.md` §3.2.

## H. 61 `!important`, and the focus ring

61 `!important` declarations (verified: `grep -o '!important' | wc -l` = 61) and 3 bare
`outline:none` against only 5 `:focus-visible` rules, with no `tabindex` anywhere in the file.

**Resolved.**
- `!important`: **0** in the rebuild's CSS, machine-checked every `npm run lint` (output above).
  Register for any future survivor: `docs/exceptions.md`.
- `outline:none`: **0** declarations. The two textual hits in `src/ui/styles/app.css` are inside the
  header comment describing this defect; `scripts/check-limits.mjs` strips comments before
  scanning. A global `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }`
  applies to everything focusable.
- Keyboard reachability: `activate()` in `src/ui/primitives/dom.ts` is the only way the UI makes a
  non-native element clickable, and it attaches a role, an accessible name and Enter/Space
  activation at the same time. The full tab-order walk is R6's evidence, not this file's, and it is
  written (`docs/ledger.md`, Done item 4).

## I. 57 `.onclick=` property assignments

Zero inline `on*=` attributes in the original's markup — it was already clean there, verified
(`grep -oE ' on[a-z]+="' | wc -l` = 0) — but **57** `.onclick=` property assignments in JS, which
silently overwrite one another and cannot be stacked.

**Resolved.** `src/ui/primitives/dom.ts` exposes `addEventListener` only; there is no `onclick`
property assignment and no inline handler attribute in `src/`. Inline attributes are machine-checked
at 0 on every lint run.

## J. Ten swallowed exceptions and one `alert()`

10 `console.warn` sites wrapping swallowed failures, plus bare `catch(_e){}`, so a broken panel
looked like an empty panel; and one `alert()` when the spreadsheet library was missing.

**Resolved in what exists.** `grep -rn 'console\.' src/` returns two lines and `grep -rn 'alert(' src/`
returns one, and all three are comments naming this defect —
`src/ui/screens/diagnose/structure/graph.ts:217` and `src/ui/screens/diagnose/simulator/data-state.ts:56`
(*"`src/` may not call `console.*`"*) and `src/export/excel.ts:6` (the original's `alert()`). There is
no call site of either. `no-empty` with `allowEmptyCatch: false` is an error-level ESLint rule
(`eslint.config.js`). Fixture failures raise a typed `FixtureError` carrying the URL and the
underlying cause (`src/data/load.ts`), and `src/main.ts` renders it as a plain-language error state
with a "Try again" action **and then re-throws**, so the headless suite sees a real failure instead
of silence. R14's console-listener assertion over a full end-to-end run is still to be written.

## K. Two remote CDN dependencies

`xlsx` 0.18.5 and `d3` 7.8.5 were both loaded from `cdnjs.cloudflare.com`, so the app could not run
offline and the Excel export failed closed with an `alert()`. In this environment cdnjs answers
**403** through the proxy, so the original cannot render here at all without interception —
vendoring was load-bearing, not hygiene.

**Resolved.** Both are committed under `vendor/` (`xlsx.full.min.js`, banner
`version:"0.18.5"`; `d3.min.js`, banner `// https://d3js.org v7.8.5`) and the parity harness
fulfils the original's two cdnjs URLs from those files (`scripts/lib/browser.mjs`), aborting
anything else off-origin. The rebuild's own runtime fetches only `data/*.json` from its own origin.

## L. Two product NAVs, $2,785.79 apart — carried deliberately

`repricing.json`.`N` = **$2,062,198,835.86** is Σ apex `ENDING_NAV` (ASCHON + DUNK + SPORTHLD) and
is what the waterfall, the hierarchy totals, the score strip and the bridge show. `lookthrough.json`
.`prodNAV` = **$2,062,196,050.07** is the fund-entity NAV stamp and is what the Structure tab's
full-screen readout shows. The difference is exactly the DUNK feeder's entire NAV
(2,062,198,835.86 − 2,785.79 = 2,062,196,050.07). A controller who full-screened Structure saw a
different product NAV than on every other screen, with nothing on either screen to say why.

**Carried, deliberately, and now labelled** (spec Q1, approved at the Phase 2 gate). Parity forbids
changing either figure, and averaging them away would be a silent data correction. Both are
preserved byte-for-byte and both are stated with their basis:

- Σ-feeder basis — "sum of top-level feeder NAVs", rendered on the Reconciliation waterfall
  (`src/ui/screens/reconciliation/waterfall.ts`).
- Fund-entity basis — to be labelled "Product NAV (fund-entity basis)" on the Structure lens when
  that lens is built.

The discrepancy is pinned as a fact rather than smoothed: `parity-map.json` keys
`structure.fullscreen.product_nav` separately from `reconciliation.waterfall.nav`, and
`tests/baseline.json` holds `Product NAV $2,062,196,050.07` against `$2,062,198,836`. It is also
written up in `data/README.md`.

**Owner: unassigned, and it needs to be assigned.** Making the two figures agree is a data
correction on Apollo Sports Capital's NAV / fund-entity mapping, with its own sign-off, and it does
not belong in a refactor. No individual is named anywhere in this repo; this row is the referral.

## M. Five entities whose ownership does not conserve — carried

The original prints, in its footer: *"Deterministic: ownership per node sums to 100%; effective
ultimate ownership solved by fixed-point (handles cross-holdings/cycles), verified to conserve."*
That blanket assurance is **overstated**. Across the 514 entities in `universe.json` that have
units outstanding, five do not close:

| Entity | Name | Effective ultimate owners sum to | Why |
|---|---|---|---|
| `ABFSUB6` | ABF Residential Loan Sub-Aggregator VI | **129.29%**, all of it through one parent, `ABFAGB` | the circular mapping the Issue Log itself reports as High severity |
| `MIDCAP` | MidCap FinCo Intermediate LLC | **3.10%** across 1 parent | overwhelmingly held outside the mapped universe |
| `APVCIAGA` | AP VCI Aggregator A, L.P. | **99.82%** across 51 parents | shortfall in the mapped edges |
| `APVCIAGB` | AP VCI Aggregator B, L.P. | **99.56%** across 20 parents | shortfall in the mapped edges |
| `APVCIINA` | AP VCI Intermediate B, LLC | **99.56%** across 20 parents | shortfall in the mapped edges |

`ABFSUB6 <- ABFAGB` at 129.29% is the only parent share anywhere above 100%.

**Carried.** These are real breaks in the source data, not artifacts of the rebuild:

- `tests/unit/ownership-differential.spec.ts` proves the extracted solve is bit-identical to the
  original's `solveU` across all 514 entities and every parent weight, so the numbers are the
  original's numbers.
- `tests/unit/ownership.spec.ts` pins all five **by name and by value** in `KNOWN_NON_CONSERVING`
  and asserts the offender set is exactly those five, so a future change to the solve cannot
  quietly add a sixth or silently fix one.
- `scripts/audit-ownership.mjs` reproduces the list from the fixture in one command.

The rebuild's obligation is therefore not to fix the data but to stop over-claiming: the footer
sentence above must not be reproduced as-is, and the Ownership lens must show the real figure
("⚠ Ultimate owners sum to 129.29%") rather than a green tick. **Owner: unassigned — this needs an
upstream data owner** for the two circular mappings and the MidCap mapping gap. Same referral as §L.

## N. The brief's "12 TODO/FIXME/HACK markers" do not exist

**Resolved as a false positive**, re-verified for this document. A case-insensitive scan of the
original for `todo|fixme|hack|xxx|kludge|workaround|temporary` returns 12 hits and they are *all*
the substring `XXX` — 10 inside the entity code `CAXXXII` and 2 inside its name
`"AP CA XXXII Holdings, L.P."`. Roman numeral thirty-two, not a marker. `grep -oiE
'todo|fixme|hack|xxx|kludge|workaround|temporary'` returns `12 XXX` and nothing else.

There is no marker debt to carry. Rubric R8 was therefore restated against this register rather
than deleted or recorded as vacuously passing (spec §0 and Q4; `docs/ux-rubric.md` R8 keeps the
original wording above the restatement so the substitution is auditable).

---

## O. The rest of §1.1–1.7 — smaller items, none dropped

| # | Item | Disposition |
|---|---|---|
| O1 | `renderBreakout('APPOURI')` hard-coded at line 2498 — the Ownership screen opens on Apollo Pour I, a demo choice, in shipped code | **Open, on a narrower point than this row used to state.** The literal is gone: the opening entity is `AppState.selectedEntity`, seeded from `StoreInit.defaultPosition` (`src/state/store.ts:120`). The reason recorded here before — that `src/main.ts` seeded it from the first `kind === 'vehicle'` node, resolving to `ASCON`, and that spec Q5's fixture field "does not exist yet" — was **false**: `data/manifest.json` carries `"defaultPosition": "APPOURI"` and `src/main.ts:41` reads it, so the seed is `APPOURI`, the position `tests/baseline.json` pins the Ownership lens on, and `npm run gate:parity` resolves all 1020 keys including `ownership.APPOURI.*`. What is still open is a different defect: `APPOURI` is a universe position and not a fund in this product's cascade, so it cannot be *shocked*. The Simulator lens falls back to the largest top-level feeder locally without writing to the store; the clean fix is a second manifest field (e.g. `defaultShockSubject`). See `docs/first-run.md`, final section. Owner: the rebuild engineer. |
| O2 | The `lt` help paragraph restates glossary term #22 ("The additive reconciliation") verbatim in substance — the definition lives in two places | **Carried, by design.** The Reconciliation screen keeps one plain-language paragraph (`renderHelp` in `src/ui/screens/reconciliation/index.ts`) because R2 requires each term to be expanded on first use *on that screen*; the glossary is the single definition of record and is one action away from every screen (R7). The duplication is now one paragraph against 35 glossary terms, not inline help on two screens. |
| O3 | `styleFocus()` and `strMakePills()` — single-call helpers on `str` | **Resolved.** The Structure lens is built (`src/ui/screens/diagnose/structure/`), and both helpers are folded into one render across `index.ts`, `graph.ts`, `layout.ts` and `controls.ts`. |
| O4 | The Structure "Dynamic" layout is the only `d3.forceSimulation` on the screen — a tick-driven async layout, and the one genuine snapshot hazard | **Carried, and pinned.** Vertical is the default and is what the harness captures; Dynamic is exercised for crash-freedom only, never for value parity (spec §5.4). |
| O5 | The simulator carries a **third** copy of the structure — `SIM.funds` (26), `SIM.edges` (33), `SIM.treeNodes` (27) — overlapping `REVBASE.funds` (26) and `EMB.nodes` (149) | **Carried in the data, resolved in the code path.** The fixture keeps all three copies byte-faithfully (§B reasoning). The rebuild reads the simulator fixture through one derived index, `CascadeIndex` in `src/domain/cascade.ts`, rather than re-deriving structure per screen. |
| O6 | `simBaseVal()` / `simBasePx()` re-derive Before/After pricing that `liveMVof()` / `revMVof()` already derive for `lt` | **Resolved.** The Simulator lens is built (`src/ui/screens/diagnose/simulator/`) and uses the single definitions in `src/domain/cascade.ts` and `src/domain/reconciliation.ts`; it derives no pricing of its own. |
| O7 | `SIM.maxlevel` and `REVBASE.maxlevel` dead | **Carried — data of record.** Counted in §B; retained in the fixtures because they are somebody's data lineage and cost 2 bytes. Owner: whoever owns the extract that produced them. |
| O8 | `UNI.counts` dead; the Issue Log screen is otherwise honest and needs the least work | **Carried — data of record.** Counted in §B; `UNI.counts.selfloops` reports 64 where the bucket has 43 rows and `UNI.edges` ships 0 self-referencing edges, so two of the three figures are stale. Nothing on screen reads them. Owner: the upstream extract. The 200-row bucket cap is now `TRUNCATE.issueRows`, defined once. |
| O9 | The glossary — the best-written part of the application — is the seventh tab, reachable only by leaving the screen that raised the question, and its content is duplicated as inline help on `lt` and `rfx` | **Resolved, re-graded against the shipped drawer.** This row used to say the drawer body and the terms were "mid-build"; they ship. Approved IA (Alternative B) demoted the glossary to a drawer reachable in one action from everywhere: `#open-glossary` in the masthead (`src/ui/chrome/shell.ts:162`) or the `G` key (`shell.ts:367`), with the body in `src/ui/drawers/glossary.ts` (397 lines) and all 35 terms in `src/glossary/terms*.ts` — `GLOSSARY_TERM_COUNT = 35` (`terms.ts:222`), `tests/e2e/rubric.spec.ts:212` asserts all 35 are present, and the parity gate resolves `glossary.term.__row_count = "35"` plus 41 other `glossary.*` keys against the rebuilt app. The one duplication that remains is the Reconciliation help paragraph, carried deliberately as O2. |
| O10 | The Before/After control is global and re-renders most screens; it is hidden on `str`, `iss`, `gls` by `pmScopeUI()` because pricing does not move those | **Resolved in the chrome.** `renderViewNote` in `src/ui/chrome/shell.ts` shows the basis wherever any figure depends on it and hides it on the lenses where nothing does (R12); the active basis is named in words ("Current marks" / "Repriced"), not as `a`/`b`. |
| O11 | The After view relabels columns rather than renaming quantities — `renderTable()` (line 1354) swaps `Current px` → `Applied px`, `Derived MV` → `Repriced MV`, `Repricing P&L` → `P&L (reconciled)` — so one label covers two quantities and one quantity answers to two labels | **Carried into a documented rule.** The label→quantity mapping, and the two collisions it removes, are `docs/labels.md`. One live gap is recorded there: the hierarchy's look-through column keeps the sub-label "current marks" in the repriced view while `liveValueOf` returns the repriced quantity. |

---

## Standing count

| Disposition | Rows |
|---|---|
| Resolved, with a file or a machine check named | A (5 bindings), C, E, F, G, H, I, J, K, N, O3, O6, O9, O10 |
| Carried, with a reason and a named owner or owning step | B, D, L, M, O2, O4, O5, O7, O8, O11 |
| Open, needs a decision from an owner outside this rebuild | O1 (a shockable default for the Simulator), plus the two unassigned data referrals in L and M — the $2,785.79 dual product NAV, and the five non-conserving entities |

This table is read off the dispositions above, and it had drifted from them: it listed E, O3, O6 and O9
as carried while each of those sections says **Resolved**, and it omitted O1 from the open row. Every
row is now the disposition its own section states.

Nothing in `docs/redesign-spec.md` §1.1–1.8 is absent from this register, and that is asserted
mechanically rather than by reading: `node scripts/check-issues.mjs` fails if an inventoried defect
is missing, if a row carries no disposition, if a carried row gives no reason, or if a disposition
asserts something the repository contradicts.

That last check exists because prose goes stale and a reader will not catch it. An independent
critic found seven rows here still describing screens, lenses and tests as unbuilt after they had
shipped, and one **Resolved** claim that was simply false. Those were re-graded against the code.
The check now runs in `npm run lint`, so the same drift cannot recur silently.
