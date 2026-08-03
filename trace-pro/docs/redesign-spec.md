# TRACE-Pro — Redesign Specification (Phase 0)

**Status:** awaiting approval. No application code has been written.
**Original under study:** `reference/TRACE-Pro-original.html` — 934,142 bytes, 2,520 lines.
**Extracted from:** `TRACE_Platform__PATCHED.html` (1,381,209 bytes), where TRACE-Pro lives as a
JS string literal on line 171 (`window.MOD_TRACEPRO`) assigned to `iframe#frame-pro.srcdoc`.
**Product / as-of in the shipped data:** Apollo Sports Capital (`SPORT`), 2026-06-30.

---

## 0. Corrections to the brief

I measured the artifact before designing against it. Five of the brief's figures do not match
the file I was given. I am flagging them rather than quietly designing around them, because two
of them change what the work is.

| Brief says | Measured | Verdict |
|---|---|---|
| 933 KB HTML document | 934,142 bytes | **Confirmed** |
| one 1,642-line script block | lines 879–2520 = **1,642 lines** | **Confirmed** |
| 7 cryptically named tabs `lt rfx str sim iss own gls` | all 7 present as `data-tab` / `id="tab-*"` | **Confirmed** |
| 599 KB dataset welded into line 2 | 599,466 chars on **line 880** — the 2nd line *of the script block* | **Confirmed in substance** |
| 197 top-level functions plus 142 arrow consts | **184** top-level `FunctionDeclaration`s, **17** function-valued consts, **55** top-level data vars = 256 top-level bindings. 728 functions counted anywhere including nested and anonymous. | **Wrong.** Corrected numbers used throughout this spec. |
| 12 TODO/FIXME/HACK markers | **zero.** A case-insensitive scan for `todo|fixme|hack|xxx|bug|kludge|workaround|temporary` returns 12 hits, all on line 880, all the substring `XXX` inside the entity code **`CAXXXII`** ("AP CA XXXII Holdings, L.P."). | **Wrong — false positive.** The brief's "12 markers" is a grep for `XXX` hitting a Roman numeral. There is no marker debt to carry. See §7 Q4. |
| two colliding declarations named `walk` and `LTV` | Confirmed and **worse than stated**: `walk` ×2, `LTV` ×4, plus `N` ×2, `P` ×2, `CUR` ×2 shadowed | **Confirmed, expanded** |
| the single-letter helpers `D` and `U` | `U` is top-level (line 889, USD formatter). `D` is a *nested* function (line 1002, inside `reviseModel`) | **Confirmed, different scopes** |

Method: `acorn` parse of the extracted script block, not grep. Script at
`scratchpad/analyze.mjs`; I will move it to `tools/audit-original.mjs` in Phase 1 so the numbers
are reproducible from the repo.

One consequence matters for the rubric: **rubric criterion 8 as seeded ("each of the 12
TODO/FIXME/HACK markers is resolved or carried") has no subject.** I have not deleted it — that
would be editing the rubric to make a check pass. It is restated in `docs/ux-rubric.md` as
criterion R8 against the real defect list I found (dead code, dead data, duplicated engines),
which is what that criterion was evidently reaching for.

---

## 1. Screen-by-screen inventory of what exists today

Shared chrome on every screen: collapsible top panel (hamburger `#chromeburger`), masthead with
active product + **Pricing view** segmented control (Before Pricing / After Pricing) + `As of`
badge, a **Sources** bar with two upload slots (Position Report `.xlsx`, NAV Report `.csv`) and a
status line, then the 7-tab bar, then a mode note strip (`#pmnote`).

The Before/After control is global and re-renders most screens. It is hidden on `str`, `iss`,
`gls` by `pmScopeUI()` because pricing does not move those.

### 1.1 `lt` — "Look-Through"

**The question a controller is answering:** *My product reports a NAV. The things it holds are
worth something else. How much of the difference is pricing, how much is cash and fees, and which
fund is responsible?*

**Controls:** fund/product search combo (`#fundinput`) · Expand all · Collapse · Export CSV ·
Download Excel · clickable flag chips (jump to the offending fund) · per-row caret expand ·
row click opens a right-hand drawer · drawer closes on Esc, ×, or outside click.

**Numbers displayed:**
- Additive waterfall hero: **Derived MV** (relabelled *Repriced MV* in After), **+ Δ Pricing**
  with bps, **= Revised MV**, **+ Δ Non-position** with bps, **= NAV**; then a tie pill reading
  either `✓ ties to the cent` or `residual $X`, and the tie equation spelled out.
- Flag strip: a count per exception category across 6 categories (Missing NAV, Material
  non-position gap, Material pricing gap, Non-positive price, Ownership > 100%, Dangling SPV).
- Hierarchy table, one row per node of a 149-node tree: NAV · Derived MV · Revised MV ·
  Δ Pricing + bps · Δ Non-position + bps. Plus a TOTALS row.
- Status hint: `PRODUCT · Derived $X → Revised $Y → NAV $Z · 26 funds`.
- Drawer: NAV, Derived/Repriced MV, Revised MV, Δ Pricing (+bps), Δ Non-position (+bps),
  Position MV (attributed), Carried MV, Immediate ownership %, Applied %, Publish price
  (NAV ÷ units, 6dp), a Held-by table (holder / own % / units, top 8 of `nHolders`), and a plain-
  English break card per exception.

**Thresholds hard-coded here:** an exception fires at `|gap| ≥ $250,000` **and** `|bps| ≥ 50`.
Both live inline in `ltFlag()` (line 1082) and again in `ltFundFlags()` (1109) and again in
`renderScore()` (1316) and again in `rfxFlag()` (1353) — four copies of the same rule.

**Dead or duplicated:**
- `id="lth-live-s"` and `id="lth-dp-s"` are destroyed by the first `renderTree()`, which
  overwrites their parents' `innerHTML`. Dead ids in shipped markup.
- `vchip()` (1067) is never called; its `.vchip` / `.v-hi` / `.v-md` / `.v-lo` CSS is live. Dead
  function with live styling.
- `EMB.recon` — 23 rows of product-vs-external ownership reconciliation — is **never rendered
  anywhere**. `MODEL.recon` has zero references.
- `EMB.resid`, `EMB.bps`, `EMB.dcN`, `EMB.apexPos`, `EMB.grandVar` — five computed product-level
  figures, never displayed. `dcN` (2,061,528,573.10) is a double-count total belonging to the
  *sibling* TRACE module.
- The `lthelp` paragraph restates glossary term #22 "The additive reconciliation" verbatim in
  substance.

### 1.2 `rfx` — "Look-Through Pricing"

**The question:** *What unit price do I publish for each fund today, and what P&L does repricing
create — at each level and for each holding?*

Two sub-views behind one toggle: **Pricing table** and **Repricing Walk**.

**Controls:** sub-view toggle · filter input · Export pricing (send-to-pricing file) ·
Download Excel · CSV · Full screen · sortable headers (9 columns in the table, 12 in the walk) ·
row click → drawer · bridge bar click → drawer · Copy publish price · per-holding row click.

**Numbers displayed:**
- Score strip, 5 tiles: Derived MV (or Repriced MV) · + Δ Pricing with bps · = Revised MV ·
  + Δ Non-position with bps · = NAV with a flagged-fund count.
- Narrative banner naming the largest repricing tier and its holdings count.
- Valuation bridge: Product NAV, the gap and its bps, Derived look-through MV, an explicit
  disclaimer that this is Σ apex ENDING_NAV and **not** Σ all 26 funds (which is $7,407,316,163),
  then one bar per apex fund with $ and bps, sorted by |gap|, scaled to the largest leg,
  colour-coded by scenario `a`/`b`.
- Pricing table per fund: Publish px (6dp) · Current px · Revised px · Derived MV · Revised MV ·
  Repricing P&L · bps chip, with apex/terminal chips and a severity dot.
- Repricing Walk per fund: Level · Global Qty · NAV · Price before (6dp) · Value before ·
  Price after · Value after · Δ Price (6dp) · Δ Value (P&L) · Δ bps, plus a PRODUCT Σ-apex total row.
- Drawer: the three price equations laid out as `NAV ÷ units`, level P&L, direct securities
  (not repriced), per-holding P&L table (top 14 of N, with `Σ per-holding P&L = level P&L`
  assertion), reconciliation to NAV, and a who-holds table (top 10).

**Dead or duplicated — this is the worst screen:**
- **Two parallel reconciliation engines coexist.** `REC` (from `PRICING.recon`) and `REVISE`
  (from `REVBASE`). Everything rendered today reads `REVISE`. `REC` survives only as a bag of
  five things: `warnBps`, `badBps`, `product`, `ltvByCode`, and the NAV-upload pipeline. Three
  functions — `recFlag()`, `buildBridge()`, `parsePivot()` — still compute the *old* model's
  gaps, and `recomputeRFX()` maintains `REC.bridge` and `REC.nFlagged` that nothing displays.
- Dead data: `PRICING.lookthroughNAV`, `.derivedTotal`, `.positionTotal`, `.repricingPnL`,
  `.priceableCount`, `.missingNav`, `.fxFunds` (7 fields); `REC.grossNonTrade`, `.grossLT`,
  `.net`, `.apexNAV`, `.productName` (5 fields).
- Dead functions `ragc()` (1305) and `recActive()` (1306).
- `PF` (line 881, `let PF=PRICING.funds||{}`) — declared, never read.
- `#rfxfull` implements full screen by toggling `body.rfxfs`. `str` and `sim` implement full
  screen through the entirely separate `GMAX` subsystem (~25 functions, line 2131+). **Two
  fullscreen implementations.**

### 1.3 `str` — "Structure"

**The question:** *How is this product actually wired — who owns whom, and where is concentration?*

**Controls:** layout segmented control (Vertical / Horizontal / Radial / **Dynamic**) · focus-an-
entity-code input · Show % checkbox · Fit · Reset · Full screen · four sliders (node spacing,
link length, curvature, label density) · drag nodes · scroll to zoom · hover to highlight a branch.

**Numbers displayed:** ownership % on each edge (2dp) · node area ∝ derived MV · a three-colour
legend (Feeder / SPV-holding / Ultimate) · in full screen, a readout showing **Product NAV**.

**Dead or duplicated:** `styleFocus()` and `strMakePills()` are single-call helpers folded into
one render. "Dynamic" is the only layout using `d3.forceSimulation` — a tick-driven async layout,
which is the one genuine snapshot hazard on this screen (see §5.4). Conceptually this screen is
the *downward* half of a question whose *upward* half is screen `own`.

### 1.4 `sim` — "Simulator"

**The question:** *If this fund's value, quantity or NAV moves, what happens to product NAV — and
through which holders does it travel?*

**Controls:** node click to select · MV / Qty / NAV shock inputs · Run · **Run full reprice**
(automatic bottom-up sweep) · **Step by stage** (you click each level) · Step / Pause / Reset ·
speed 0.5× / 1× / 2× · Isolate affected · Follow camera · Dark / Light stage theme · Reset ·
Focus (declutter) · Full screen · zoom − / + / Fit · shock-panel handle · ledger handle.

**Numbers displayed:** Product NAV in the bar · per-node value and price, with `was …` on
repriced nodes · P&L halos (▲/▼ with abbreviated $) · a result chip · the run control
(`Level L (n/total) · k nodes repriced → parents · Δ ±$X`) · run numbers (Revised look-through,
Repricing P&L, and a `✓ reconciled · no pricing break` badge) · the cascade ledger (holder /
own % / P&L / amount, with bars) · the full-reprice ledger (Derived → + Repricing P&L → Revised
→ + Non-position → Product NAV) · break cards.

**Dead or duplicated:** the simulator carries **its own third copy of the structure** —
`SIM.funds` (26), `SIM.edges` (33), `SIM.treeNodes` (27) — overlapping `REVBASE.funds` (26) and
`EMB.nodes` (149). `simBaseVal()` / `simBasePx()` re-derive Before/After pricing that
`liveMVof()` / `revMVof()` already derive for `lt`. `SIM.maxlevel` is dead.

### 1.5 `own` — "Ownership Breakout"

**The question:** *For this one position, who ultimately owns it, and in what proportion?*

**Controls:** search any position (SPV symbol, fund, or security) · row click → derivation
inspector · caret expands *upward* · ribbon segment click scrolls to that owner ·
"Show all N ultimate owners" toggle.

**Numbers displayed:** header (total qty, `100%`) · proportional ribbon (up to 40 segments) ·
integrity checks (`✓ Owners reconcile to 100%`, `✓ Ultimate owners = 100%`, n immediate owners,
n ultimate parents, top-5 share) · table (qty held, Immediate %, Cumulative % with an inline bar)
· `= 100% of X · N units` subtotal rows · inspector (`H owns P% of parent`, `qty ÷ total = %`,
the multiplicative ladder `SYM ×a% → ×b% → = cum%`) · ultimate-owner rollup with % and units.

**Dead or duplicated:** the opening position is the hard-coded literal `renderBreakout('APPOURI')`
at line 2498 — Apollo Pour I, chosen for a demo, in shipped code.

### 1.6 `iss` — "Issue Log"

**The question:** *Before I trust any number above, what is wrong with the source data?*

**Controls:** scope combo (All fund entities, or one entity's reachable world) ·
Download all (CSV) · per-bucket download · accordion expand.

**Numbers displayed:** tab badge (total = **105**) · KPI cards High / Medium / Low / Total with
the active scope · per bucket count and severity · rows, capped at 200 with `+N more (in CSV)`.

The five buckets as shipped: Self-mapping (fund holds its own code) **43** Medium ·
Circular mapping **2** High · Missing / dangling SPV code **29** High ·
Incomplete look-through (double-count flag, nothing beneath) **9** Medium ·
Unmapped identifiers **22** Low.

**Dead or duplicated:** `UNI.counts` is dead. This screen is honest and needs the least work.

### 1.7 `gls` — "Glossary"

**The question:** *What does this word mean, where does the number come from, and how is it computed?*

**Controls:** search box (terms, aliases, definitions) · 7 category chips (All + 6 sections) ·
count readout `N of M terms`.

**Content:** 35 terms in 6 sections — *The three price columns* (5), *Value & P&L columns* (9),
*Look-through & market value* (4), *NAV & reconciliation* (8), *Structure & ownership* (5),
*Sources & systems* (4). Each card carries plain language, SOURCE, METHOD, aliases, and a worked
example computed from live data (pinned to `SPORTHFC` and `DEUCE2FC`).

**Dead or duplicated:** this is the best-written part of the application, and it is the seventh
tab — reachable only by leaving the screen that raised the question. Its content is duplicated as
inline help paragraphs on `lt` and `rfx`.

### 1.8 Cross-cutting defects

1. **Two product NAVs are displayed, differing by exactly $2,785.79.** `REVBASE.N` =
   `$2,062,198,835.86` is Σ apex ENDING_NAV (ASCHON + DUNK + SPORTHLD) and is what the waterfall,
   tree, score strip and bridge show. `EMB.prodNAV` = `$2,062,196,050.07` is the fund-entity NAV
   stamp and is what the **Structure tab's full-screen readout** shows via `MODEL.prodNAV`. The
   difference is DUNK's entire NAV ($2,785.79 — verified: 2,062,198,835.86 − 2,785.79 =
   2,062,196,050.07). A controller who full-screens the Structure tab sees a different product NAV
   than on every other screen. See §7 Q1.
2. **61 `!important` declarations.**
3. **Zero inline `on*=` attributes in markup** — already clean, and the rebuild must keep it. But
   **57 `.onclick=` property assignments** in JS, which silently overwrite each other and cannot
   be stacked.
4. **`outline:none` appears 3 times** against only 5 `:focus-visible` rules; **no `tabindex`
   anywhere** in TRACE-Pro. Keyboard reachability is partial: the tab bar, the graphs' nodes, the
   accordion headers and the sortable table headers are `div`/`th` click targets.
5. **10 `console.warn` sites** wrapping swallowed exceptions (`catch(_e){}` appears throughout),
   so failures are invisible. One `alert()` for a missing spreadsheet library.
6. **Both CDN dependencies are remote** (`cdnjs` xlsx 0.18.5, d3 7.8.5). The app cannot run
   offline today, and the Excel export path fails closed with an `alert()`.
7. Five identifier collisions by shadowing: `LTV` (function at 1058; `const` at 1396 and 1409;
   nested function at 2043), `walk` (nested at 1060 and 1159 — two unrelated algorithms), `N`
   (formatter at 891, shadowed at 1069 and 1988), `P` (percent formatter at 893, shadowed at 1252
   and 1591), `CUR` (state at 1157, shadowed at 931).

---

## 2. Proposed information architecture — three refined alternatives

All three obey the same two rules, which are the point of the exercise:

- **Every screen opens with one sentence naming the question it answers.**
- **The glossary stops being a destination.** Its 35 terms become the definition layer behind
  every label on every screen, reachable in one action from anywhere.

They differ in how far they consolidate. I recommend **Alternative B**.

### Alternative A — "Seven to Five" (conservative)

Keep the tab metaphor. Merge only what is provably one task.

| New screen | One-line question | Absorbs |
|---|---|---|
| **1. Reconciliation** | "Does my NAV agree with what I hold, and where is the difference?" | `lt` |
| **2. Pricing** | "What price do I publish, and what P&L does repricing create?" | `rfx` (both sub-views) |
| **3. Structure & Ownership** | "Who owns whom — downward from the product, upward from a position?" | `str` + `own` |
| **4. Simulator** | "If this moves, what happens to product NAV?" | `sim` |
| **5. Data Quality** | "What's wrong with the source data?" | `iss` |
| *drawer* | Glossary — one action from every screen | `gls` |

**Task justification for the one merge:** `str` answers "who does the product own" and `own`
answers "who owns this position". A controller chasing a break traverses in both directions in a
single sitting — today that is a tab switch plus a re-search, losing the entity they were on.
Merging them keeps the focused entity and flips the direction with one control.

**Cost:** `sim` remains a screen that most controllers open once a quarter, holding a top-level
slot equal to Reconciliation. **Benefit:** lowest parity risk; smallest diff; nothing to relearn.

### Alternative B — "One Answer, Three Rooms" (recommended)

Organise by the controller's actual sequence — *is it right? → what do I publish? → why is it
wrong?* — rather than by data structure.

| New screen | One-line question | Absorbs |
|---|---|---|
| **1. Reconciliation** — the landing screen | "Does my NAV agree with what I hold, and where is the difference?" | `lt` + the score strip and bridge from `rfx` |
| **2. Pricing** | "What unit price do I publish for each fund today, and what P&L does repricing create?" | `rfx` pricing table + Repricing Walk (as two views of one table, not a hidden toggle) |
| **3. Diagnose** | "Why is this fund off — how is it wired, who owns it, what's wrong with its data, and what if it moves?" | `str` + `own` + `iss` + `sim`, as four **lenses on one selected entity** |
| *drawer* | Glossary — one action from every screen | `gls` |
| *drawer* | Sources & as-of — upload, provenance, what recomputed | the Sources bar |

**Task justification.** The three top-level screens are the three things a fund controller
actually does with this tool, in order. Everything in *Diagnose* shares one property: it is only
ever opened **about a specific entity you already suspect**. Today, suspecting `SPORTHFC` on the
Reconciliation screen and wanting to know how it is wired, who owns it, whether its data is
broken, and what a shock does costs four tab switches and four separate searches for the same
code. Making entity selection the shared state of one screen and the four views its lenses
matches the task and deletes three redundant searches.

The score strip and bridge move onto Reconciliation because they answer *that* screen's question
(where is the gap, per driver) rather than the pricing question. This is the one move that
reduces `rfx` to a genuinely single-purpose screen.

**Cost:** Diagnose is the densest screen and needs real design discipline — four lenses, one
selection, no lens allowed to lose the selection. **Benefit:** the primary answer is on the
landing screen; the diagnostic loop stops costing four searches; `sim` stops competing with
Reconciliation for attention while remaining one click away.

### Alternative C — "Answer and Evidence" (most opinionated)

Two screens plus drawers. A single **Answer** screen states the reconciliation and the publish
prices; everything else is evidence summoned about a row.

| New screen | One-line question | Absorbs |
|---|---|---|
| **1. Answer** | "Does my NAV tie, and what do I publish?" | `lt` + `rfx` in one scrollable page: waterfall, bridge, then one master table whose columns switch between reconciliation and pricing |
| **2. Evidence** | "Show me everything about this one entity." | `str` + `own` + `sim` + `iss`, entity-scoped |
| *drawers* | Glossary · Sources · Exceptions | `gls`, Sources bar, flag strip |

**Task justification:** the controller's deliverable is one number tying and one price file
going out. Both belong on one page. **Cost:** the master table carries 15+ columns behind a
switch, which is exactly the kind of density that made the original hard to learn; and it is the
highest-parity-risk option because it moves the most rendered figures. **Benefit:** fewest
screens, single scroll path to the deliverable.

### Why B

A is safe but leaves the IA shaped like the data model. C is elegant but re-homes almost every
figure at once, which fights the one hard constraint — zero value diffs — and puts 15 columns
behind a toggle, repeating the original's core sin. B moves the fewest figures that still buys
the real win: *the diagnostic loop stops costing four searches for the same entity code.*

**Screens: 7 → 3 + 2 drawers.** Demoted to drawers: Glossary (from tab to omnipresent),
Sources/as-of (from a permanent bar to a drawer with provenance). Merged: `str`+`own`+`iss`+`sim`
into Diagnose as lenses. Nothing is deleted.

---

## 3. Rename table

### 3.1 User-visible vocabulary

The tab codes are the headline, but the labels *inside* the screens carry more confusion than the
tab names do. `Δ` and `bps` stay — they are a controller's own vocabulary, and the rubric requires
they be defined on first use, not removed.

| Today (user-visible) | Becomes | Why |
|---|---|---|
| `lt` | **Reconciliation** | The tab already reads "Look-Through"; the code is only in the DOM |
| `rfx` | **Pricing** | "rfx" means nothing; the label already reads "Look-Through Pricing" |
| `str` | **Structure** (a lens in Diagnose) | — |
| `sim` | **Simulator** (a lens in Diagnose) | — |
| `iss` | **Data quality** (a lens in Diagnose) | "Issue Log" reads like a support ticket queue |
| `own` | **Ownership** (a lens in Diagnose) | — |
| `gls` | **Glossary** (drawer) | — |
| Derived MV | **Look-through value (current marks)** | "Derived" says nothing about *from what* |
| Revised MV | **Repriced value (NAV, bottom-up)** | "Revised" implies a correction; it is a repricing basis |
| Repriced MV *(the After-mode relabel of Derived MV)* | **Look-through value (at repriced marks)** | Today two different quantities are both called "Repriced" in different modes |
| Δ Pricing | **Pricing difference** | |
| Δ Non-position | **Non-position difference (cash, fees, receivables)** | The parenthetical is the definition and belongs in the label |
| Publish px | **Price to publish (NAV ÷ units)** | |
| Current px | **Current mark** | |
| Applied px *(After-mode relabel of Current px)* | **Repriced mark** | "Applied" collides with "Applied %" |
| Revised px | **Repriced unit price** | |
| Immediate % | **Direct share (of the level below)** | |
| Applied % | **Effective share (of the product)** | "Applied" is used for two unrelated things |
| Cumulative % | **Effective share (of the searched position)** | |
| mv100 / Value of 100% | **Value of the whole entity (100%)** | |
| Carried MV | **Book value of the stake (as booked)** | |
| Position MV | **Position value (attributed to product)** | |
| Variance | **Look-through minus as-booked** | "Variance" is overloaded in fund accounting |
| bps | **bps** — defined inline on first use per screen | Controller vocabulary; keep, define |
| Δ | **Δ** — with the word "change" in the column subtitle | |
| gq / Global units | **Units outstanding (firm-wide)** | |
| apex | **Top-level feeder** | |
| terminal | **Lowest level (prices from NAV ÷ units)** | |
| scen a / scen b | **NAV below look-through / NAV above look-through** | `a`/`b` is unexplained in the UI |
| SOURCES | **Data sources & as-of** | |
| VPM symbol | **VPM symbol** — glossary-linked | A real system name; keep, define |
| SPV | **SPV** — glossary-linked | Controller vocabulary |
| `⟲` cycle marker | **Circular holding** + icon | |
| "no NAV" / `nonav` | **No NAV reported** | |
| "in tol" | **Within tolerance** | |
| "Run full reprice" | **Reprice everything (bottom-up)** | |
| "Step by stage" | **Reprice one level at a time** | |

### 3.2 Internal identifiers

| Today | Becomes | Note |
|---|---|---|
| `EMB` | `lookthroughFixture` | 49.6 KiB — 149 tree nodes + 23 dead recon rows |
| `UNI` | `universeFixture` | 472.5 KiB — firm-wide ownership graph |
| `PRICING` | `legacyPricingFixture` | 29.6 KiB — supplies only `warnBps`/`badBps`/`product`/`ltvByCode` |
| `REVBASE` | `repricingFixture` | 31.3 KiB — the authoritative reconciliation |
| `SIM` | `simulatorFixture` | 31.4 KiB |
| `REVISE` | `repricing` (state) | |
| `REC` | `legacyPricing` (state) | Slated for deletion once the NAV-upload path is ported |
| `MODEL` | `lookthroughTree` | |
| `MAPS` | `positionIndex` | |
| `REV` / `Umap` | `ownershipGraph` / `effectiveShareByEntity` | |
| `U` | `formatUsd` | |
| `Uv` | `formatUsdParens` | Negatives in parentheses |
| `Uc` / `Ucv` | `formatUsdCompact` / `formatUsdCompactParens` | |
| `N` (formatter) | `formatCount` | Resolves the `N` collision |
| `Q` | *deleted* | Dead |
| `P` | `formatPercent` | Resolves the `P` collision |
| `D` (nested, line 1002) | `derivedValueOf` | |
| `LTV` (function, 1058) | `lookThroughValue` | Resolves the 4-way `LTV` collision |
| `LTV` (const, 1396 / 1409) | `derivedByCode` | |
| `walk` (1060) | `walkLookthroughTree` | Two unrelated algorithms, two names |
| `walk` (1159) | `walkOwnersUpward` | |
| `walk` (view name, 1526) | `'repricing-walk'` | A view id, not a traversal |
| `CUR` (1157) | `selectedPositionCode` | |
| `ubMark` | `markSourceLoaded` | |
| `gmax*` (25 fns) | `stageFullscreen.*` | One module, not 25 globals |
| `GMAX` / `GMAX_CHROME` | `stageFullscreenState` / `CHROME_SELECTORS` | |
| `simFR*` (16 fns) | `repriceRun.*` | "FR" = full reprice |
| `simFR` | `repriceRunState` | |
| `PF` | *deleted* | Dead |
| `vchip`, `ragc`, `recActive` | *deleted* | Dead |
| `dcN`, `resid`, `bps`, `apexPos`, `grandVar` (EMB) | *retained in fixture, unread* | Fixtures are data of record; §7 Q2 |
| `pmSyncUI` / `pmRenderAll` / `pmScopeUI` / `setPricingMode` | `pricingView.*` | |
| `SIM_DUR` / `FR_DUR` | `SHOCK_STEP_MS` / `REPRICE_STEP_MS` | |
| `simTouched` | `shockFieldsEdited` | |
| `nrmH` / `pnum` / `splitCsv` / `normFundCode` | `normalizeHeader` / `parseNumber` / `splitCsvLine` / `normalizeFundCode` | |

---

## 4. Module boundary plan

The math is the crown jewel. It moves first, into pure modules with **no DOM access and no
imports from `ui/` or `state/`**, and it is unit-tested before any UI is rewired to it. A lint
rule enforces the direction of dependency, so the boundary cannot rot.

```
trace-pro/
├── index.html                         # shell only: <div id="app">, no data, no logic
├── package.json  tsconfig.json  vite.config.ts  eslint.config.js  vitest.config.ts
├── playwright.config.ts
├── data/                              # fixtures, loaded at runtime by fetch()
│   ├── manifest.json                  # products × as-of dates available
│   └── apollo-sports-capital/2026-06-30/
│       ├── lookthrough.json           # was EMB          49.6 KiB
│       ├── universe.json              # was UNI         472.5 KiB
│       ├── repricing.json             # was REVBASE      31.3 KiB
│       ├── simulator.json             # was SIM          31.4 KiB
│       └── legacy-pricing.json        # was PRICING      29.6 KiB
├── vendor/                            # committed, offline
│   ├── xlsx.full.min.js               # 0.18.5, integrity-pinned
│   └── d3.min.js                      # 7.8.5
├── src/
│   ├── main.ts                        # boot: load fixtures → build state → mount screens
│   ├── domain/                        # ── PURE. no DOM. no state. fully unit-tested. ──
│   │   ├── types.ts
│   │   ├── money.ts                   # formatUsd, formatPercent, bps, formatCount …
│   │   ├── ownership.ts               # ownershipShare, solveEffectiveShares (fixed point)
│   │   ├── lookthrough.ts             # lookThroughValue, buildLookthroughTree, walkLookthroughTree
│   │   ├── repricing.ts               # recomputeRepricedValues, repriceFromPositions, applyNavOnly
│   │   ├── cascade.ts                 # shockCascade (topological), buildRepriceRun
│   │   ├── reconciliation.ts          # buildWaterfall, buildBridge, tie checks
│   │   ├── exceptions.ts              # ONE definition of the $250k / 50bps rule (today: 4 copies)
│   │   └── ingest/                    # parsers: positionReport.ts, navReport.ts, csv.ts
│   ├── state/                         # owns mutable app state + change notification
│   │   ├── store.ts                   # selected product, as-of, pricing view, selected entity
│   │   └── selectors.ts               # derived views; calls domain/, never touches DOM
│   ├── ui/                            # owns rendering only; reads state, calls domain
│   │   ├── chrome/                    # masthead, as-of badge, pricing-view control, nav
│   │   ├── screens/
│   │   │   ├── reconciliation/        # waterfall, bridge, tree, exceptions strip, detail
│   │   │   ├── pricing/               # price table, repricing walk, detail
│   │   │   └── diagnose/              # shell + 4 lenses sharing one selected entity
│   │   │       ├── structure/  ownership/  data-quality/  simulator/
│   │   ├── drawers/                   # glossary, sources
│   │   └── primitives/                # table, drawer, combobox, chip, stat, empty/loading/error
│   ├── glossary/terms.ts              # 35 terms as data; the definition layer for every label
│   └── export/                        # excel.ts, csv.ts  (only place vendor/xlsx is touched)
├── tests/
│   ├── unit/                          # domain/* — ownership solve, walk, cascade, bridge
│   ├── e2e/                           # Playwright: 3 screens, 4 lenses, exports, console-clean
│   └── baseline.json                  # frozen Phase 1 evidence
├── scripts/snapshot.mjs               # the parity harness
├── parity-map.json                    # semantic key → selector → screen
└── docs/                              # this spec, ux-rubric, ledger, exceptions, evidence
```

**Ownership of concerns.** `domain/` owns every number and knows nothing about screens.
`state/` owns what is selected and notifies. `ui/` owns pixels and may not compute a figure —
if a component needs a number it asks a selector, which asks the domain. `export/` is the only
consumer of `vendor/xlsx`. Fixtures are fetched, never imported, so no source file carries a
data literal.

**Sequencing (Phase 2, one screen at a time, gate green after each):**
1. `domain/` extracted verbatim-equivalent + unit tests. No UI change. Gate must stay green.
2. Reconciliation screen rewired to `domain/`. Parity re-run.
3. Pricing screen. 4. Diagnose shell + Structure lens. 5. Ownership lens. 6. Data-quality lens.
7. Simulator lens. 8. Glossary + Sources drawers. 9. Delete the legacy `REC` path last, only
once the NAV-upload flow is proven on the new path.

---

## 5. Data plan

### 5.1 What is embedded today

| Blob | Line | Chars in source | JSON size | Contents |
|---|---|---|---|---|
| `UNI` | 880 | 484,839 | 472.5 KiB | 1,382 edges · 710 entities · 2,500 search rows · 1,986 ultimates · 5 issue buckets · `entReach` for 710 entities |
| `EMB` | 880 | 51,591 | 49.6 KiB | 149 tree nodes · 23 (dead) recon rows · product headline |
| `SIM` | 1556 | 32,448 | 31.4 KiB | 26 funds · 33 edges · 27 tree nodes · 14 breaks |
| `REVBASE` | 880 | 32,368 | 31.3 KiB | 26 funds · navByFund/revByFund/ltvByFund/gqByFund · 3 apex · 6 breaks |
| `PRICING` | 880 | 30,631 | 29.6 KiB | `recon` (21 funds, bridge, thresholds) + 7 dead top-level fields |
| **Total** | | **631,877 (617 KiB)** | | |

### 5.2 Target

Each blob becomes a JSON file under `data/<product-slug>/<as-of>/`, fetched at boot. A
`data/manifest.json` lists available product × as-of pairs; the app reads product and as-of from
the URL (`?product=apollo-sports-capital&asof=2026-06-30`), falling back to the manifest's
default. This is what unhardcodes Apollo Sports Capital at 2026-06-30 — the two values become
route parameters, not constants, and `README.md` documents adding a second product as: drop a
folder in `data/`, add a manifest line.

Extraction is mechanical and verifiable: a Phase 1 script evaluates the five declarations in a
`node:vm` context and writes `JSON.stringify(value)`. A round-trip assertion (`deepEqual`
against the in-page values) runs in CI, so a fixture can never silently drift from the original.

`UNI` at 472 KiB is 75% of the payload and is only needed by two lenses (Ownership,
Data quality). It is fetched lazily on first use of either, with a defined loading state — which
is also how rubric criterion 4 gets satisfied honestly rather than by asserting a spinner that
never shows.

**Fixtures are data of record and are copied byte-faithfully, including the dead fields.** I am
not pruning `EMB.recon` or `dcN` from the data. Pruning would be a judgment call about someone
else's data on a run whose contract is "do not change a single figure". They are marked unread in
a `data/README.md` provenance note instead. See §7 Q2.

### 5.3 The as-of date

`asof` is a data field (`"2026-06-30"`) in four of five blobs, and **nothing in the application
reads a clock** — there is no `new Date`, `Date.now`, `Math.random`, or `performance.now`
anywhere in the 1,642 lines. Every rendered figure is a pure function of the fixtures. This is
the single best property of the original and it is why byte-identical snapshots are achievable.

### 5.4 Nondeterminism inventory (for the Phase 1 harness)

Verified absent: clocks, randomness, locale-date formatting. Present and to be pinned:

| Source | Count | Harness treatment |
|---|---|---|
| `sessionStorage` (`tracePricingMode`, `traceSimTheme`, `traceChrome`) | 3 keys | Fresh browser context per run; set explicitly before boot. **This is the top risk:** a run that toggles to After Pricing writes the key, so run 2 in a reused context would boot in a different mode. |
| `setTimeout` | 24 | `activateTab` defers renders 20–30 ms; harness awaits a settle predicate, never a fixed sleep |
| `d3.forceSimulation` | 1 (Structure "Dynamic" layout only) | Not the default (`vertical` is). Harness pins Vertical; Dynamic is exercised in the e2e suite for crash-freedom only, not for value parity |
| `.transition()` / `.duration()` | 10 | Read text after transitions settle |
| `clientWidth` / `clientHeight` | 5 | Fixed viewport (1600×1000) recorded in the harness config |
| Animation timers in `sim` | — | Snapshot the resting state and the *completed* reprice, never mid-flight |

---

## 6. What I will assert in the parity map (Phase 1 preview)

Roughly 180–220 semantic keys, authored against the original while it is intact, keyed on
meaning and never on DOM position — e.g. `reconciliation.waterfall.derived_mv`,
`reconciliation.waterfall.delta_pricing_bps`, `reconciliation.tie.status`,
`pricing.fund.SPORTHFC.publish_px`, `pricing.bridge.apex.DUNK.gap_usd`,
`pricing.walk.total.delta_value`, `ownership.APPOURI.ultimate_sum_check`,
`data_quality.bucket.circular_mapping.count`, `structure.fullscreen.product_nav`
(deliberately keyed separately from `reconciliation.waterfall.nav`, so the $2,785.79 discrepancy
of §1.8.1 is *pinned as a fact*, not averaged away), `glossary.term_count`.

Both pricing views (Before / After) are captured for every screen that responds to the toggle,
since the toggle relabels columns and changes values.

---

## 7. Open questions

**Q1 — The two product NAVs ($2,785.79 apart).** `EMB.prodNAV` (fund-entity NAV stamp) shows on
the Structure full-screen readout; `REVBASE.N` (Σ apex ENDING_NAV) shows everywhere else. The
difference is exactly the DUNK feeder's NAV.
*My recommendation:* **preserve both figures exactly** — parity forbids changing either — and in
the rebuild label the Structure readout "Product NAV (fund-entity basis)" against
"Product NAV (Σ top-level feeders)" elsewhere, with both defined in the glossary. That changes no
figure and stops the number looking like a bug. If you would rather they agree, that is a data
correction with a real owner, and it belongs in a separate change with its own sign-off — not in
a refactor.

**Q2 — Dead data in fixtures.** `EMB.recon` (23 rows), `EMB.dcN/resid/bps/apexPos/grandVar`,
7 `PRICING` fields, 5 `REC` fields, `UNI.counts`, two `maxlevel`s are never read.
*My recommendation:* **keep them in the fixtures, document them as unread.** They cost 3 KiB and
they are somebody's data lineage. Delete the dead *code* (`PF`, `Q`, `vchip`, `ragc`,
`recActive`), which costs nothing.

**Q3 — The legacy `REC` engine.** Two reconciliation models coexist; only `REVISE` renders.
*My recommendation:* **port the NAV-upload pipeline onto the `REVISE` model and delete `REC`
last**, after parity is green on everything else. It is the highest-risk deletion in the run
because `parsePivot`/`applyRawFeedToREC` carry hard-won robustness (the `PREV_DAY_ENDING_NAV`
trap, NBSP-dirty fund codes). That robustness gets unit tests before the deletion, not after.

**Q4 — Rubric criterion 8 has no subject.** There are no TODO/FIXME/HACK markers; the "12" was a
grep for `XXX` matching the entity code `CAXXXII`. I have restated the criterion as R8 against
the real defect inventory (§1.8) rather than deleting it.
*My recommendation:* accept R8 as restated. Tell me if you would rather I hold the original
wording and record it as vacuously passing — I would rather not, since a vacuous pass is exactly
the kind of green checklist this brief warns against.

**Q5 — `renderBreakout('APPOURI')` hard-coded default.** The Ownership lens opens on Apollo Pour I.
*My recommendation:* make it a fixture field (`universe.defaultPosition`) seeded to `APPOURI`, so
parity holds exactly today and a different product can set its own default.

**Q6 — 61 `!important` and 3 `outline:none`.**
*My recommendation:* drive `!important` to zero by fixing specificity, and remove all three
`outline:none` (they are the direct cause of the keyboard-focus rubric risk). Anything that
genuinely cannot be removed goes in `docs/exceptions.md` with a reason. I expect zero survivors
and will report the real count.

**Q7 — Single-file bundle.** The brief mentions emailing colleagues.
*My recommendation:* ship both — `npm run build` for the normal app, `npm run build:single` for a
self-contained HTML with fixtures inlined. The single-file target is the *output* of a build, not
the source, so it does not reintroduce the 400-line or 2,000-char rules.

**Q8 — Which of the three IAs.** I recommend **B**. A is the low-risk fallback if you want the
tab metaphor preserved; C if you want maximum consolidation and accept the higher parity risk.

---

## 8. What I am not doing

Not touching `reference/TRACE-Pro-original.html` (read-only for the rest of the run), the sibling
TRACE module, or the platform shell beyond the one line needed to point `frame-pro` at the new
build. Not changing a single reported figure. Not editing `parity-map.json`,
`tests/baseline.json`, or `docs/ux-rubric.md` after their phase closes.
