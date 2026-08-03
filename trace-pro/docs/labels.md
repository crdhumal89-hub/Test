# Labels and precision

Evidence for rubric **R10** (no two different quantities share a user-visible label) and **R17**
(numeric precision is consistent and documented).

Two rules, both mechanical:

1. **One label, one quantity — in both pricing views.** A label is the text a controller reads: a
   column header, a waterfall step, a key in a detail panel, a chip. Every one of them resolves to
   exactly one domain quantity, and the mapping may not change when the pricing basis is switched
   between **Current marks** and **Repriced**. If a quantity changes with the basis, the *label*
   changes with it, so the reader is never looking at a label that no longer means what it said.
2. **One precision per quantity class,** applied everywhere, defined once in
   `src/domain/money.ts`.

Where the vocabulary changes, `docs/rename-map.json` is the machine-checked declaration — a frozen
per-key statement of the exact string the rebuild must render, guarded by an assertion that every
numeric token in the string survives unchanged ("words may change; digits may not"). It covers the
38 baseline keys whose text carries a retired term; the other 982 stay byte-identical to
`tests/baseline.json`. This file is the human-readable half of the same contract: what each label
means, and what precision it is rendered at. Where the two could ever disagree, the rename map wins,
because the gate reads it.

The two pricing views are the app's two bases, named in words in the masthead
(`src/ui/chrome/shell.ts`): **Current marks** (the original's "Before Pricing") and **Repriced**
(the original's "After Pricing").

---

## 1. The domain quantities

Labels map onto these, and nothing else. The right-hand column is the single definition of each
quantity; a label that cannot be traced to one of these rows is a bug.

| Quantity | Meaning | Defined in |
|---|---|---|
| `nav` | The entity's own reported NAV (`ENDING_NAV`), weighted by the product's effective share | `navValueOf` — `src/domain/lookthrough.ts` |
| `derived` | The underlyings at **today's marks**, rolled up through ownership and weighted by the product's effective share | `LookthroughNode.derived`; `liveValueOf` selects it under Current marks |
| `revised` | The same tree with every fund **NAV-repriced bottom-up** | `revisedValueOf` — `src/domain/lookthrough.ts` |
| `deltaPricing` | `revised − derived` | `reconcileNode` / `buildWaterfall` |
| `deltaNonPosition` | `nav − revised` | `reconcileNode` / `buildWaterfall` |
| `residual` / `tie` | `deltaPricing + deltaNonPosition`, which must equal `nav − start` | `buildWaterfall` — `src/domain/reconciliation.ts` |
| `publishPrice` | `nav ÷ units outstanding` for that entity | `src/domain/repricing.ts`; `RepricingFund.navPx` |
| `currentPrice` | The mark the position report carries today | `RepricingFund.curPx` |
| `revisedPrice` | The NAV-repriced unit price | `RepricingFund.revPx` |
| `globalUnits` | Units outstanding of the entity, firm-wide | `RepricingFixture.gqByFund`; `RepricingFund.gq` |
| `directShare` | Units held ÷ units outstanding of the level immediately below | `directShare` — `src/domain/ownership.ts`; `LookthroughNode.ownpct` |
| `effectiveShare` | The product's share of the entity after multiplying through every level | `LookthroughNode.applied`; `solveEffectiveShares` |
| `cumulativeShare` | The same multiplication run **upward** from a searched position to one owner | `walkOwnersUpward` — `src/domain/ownership.ts` |
| `wholeEntityValue` | Value of 100% of the entity (not the product's slice) | `LookthroughNode.mv100` |
| `bookValue` | The stake as booked in the position report | `LookthroughNode.carried` |
| `positionValue` | Position value attributed to the product | `LookthroughNode.position` |
| `levelPnL` | Repricing P&L created at one level | `RepricingFund.pnlLevel` |
| `holdingPnL` | Repricing P&L on one holding | `RepricingHolding.pnl` |
| `bps` | Any difference ÷ NAV × 10,000 | `bpsOf` — `src/domain/money.ts` |

Both product NAVs are distinct quantities and are never given the same label — see §4.

## 2. Label → quantity: Reconciliation

Rendered today by `src/ui/screens/reconciliation/{waterfall,tree,detail}.ts`.

| Label under **Current marks** | Label under **Repriced** | Quantity | Where |
|---|---|---|---|
| Look-through value | Look-through value at repriced marks | `derived` (`liveValueOf`: `derived` under Current marks, `revised` under Repriced — hence the label change) | waterfall step 1 |
| Pricing difference | Pricing difference *(basis reads "reconciled · no pricing break", value `$0`)* | `deltaPricing` | waterfall operator 1 |
| Repriced value | Repriced value | `revised` | waterfall step 2 |
| Non-position difference | Non-position difference *(basis reads "non-trade · cash, fees, receivables")* | `deltaNonPosition` | waterfall operator 2 |
| NAV | NAV | `nav`, Σ top-level feeder basis — basis line reads "sum of top-level feeder NAVs · as of *date*" | waterfall step 3 |
| ✓ ties to the cent / residual ($X) | same | `residual` | tie pill |
| Hierarchy — fund ▸ SPV ▸ security | same | not a figure | tree column 1 |
| VPM symbol | same | not a figure (glossary-linked term) | tree column 2 |
| NAV · reported | same | `nav` | tree column 3 |
| Look-through value · current marks | *must read* "at repriced marks" — see §5 | `derived` | tree column 4 |
| Repriced value · NAV-repriced | same | `revised` | tree column 5 |
| Pricing difference · repriced − look-through | Pricing difference · reconciled | `deltaPricing` | tree column 6 |
| Non-position difference · NAV − repriced | same | `deltaNonPosition` | tree column 7 |
| Position value attributed to this product | same | `positionValue` | detail panel |
| Book value of the stake | same | `bookValue` | detail panel |
| Direct share of the level below | same | `directShare` | detail panel |
| Effective share held by this product | same | `effectiveShare` | detail panel |
| NAV ÷ units outstanding | same | `publishPrice` | detail panel |
| Units outstanding, firm-wide | same | `globalUnits` | detail panel |
| Holder / Direct share / Units held | same | holder identity / `directShare` / units held | detail "Held by" table |

The exception chips carry a category name, not a quantity: **Missing NAV**, **Material
non-position gap** (**Non-position residual (non-trade)** under Repriced), **Material pricing gap**,
**Non-positive price**, **Ownership > 100%**, **Dangling SPV** — one string each, defined once in
`groupExceptions` / `EXCEPTION_TIPS` (`src/domain/exceptions.ts`).

## 3. Label → quantity: Pricing

The vocabulary is `docs/rename-map.json` → `vocabulary`, which is the frozen form of
`docs/redesign-spec.md` §3.1; the retired label is kept in the first column because that is what
`tests/baseline.json` holds. Terms marked *(spec only)* are renames the spec sets out that the frozen
map does not cover, because no baseline key carries them.

| Retired label (Current marks → Repriced) | Label to render | Quantity |
|---|---|---|
| Publish px | Price to publish | `publishPrice` |
| Current px → **Applied px** | Current mark → **Repriced mark** | `currentPrice` → `revisedPrice` |
| Revised px | Repriced unit price | `revisedPrice` |
| Derived MV → **Repriced MV** | Look-through value → Look-through value at repriced marks | `derived` (`ltv` → `rev`) |
| Revised MV | Repriced value | `revised` |
| Repricing P&L → **P&L (reconciled)** | Repricing gain or loss (reconciled to $0 under Repriced) | `levelPnL` |
| bps | bps — defined inline on first use per screen | `bps` |
| Level *(spec only)* | Level (1 = lowest, priced from NAV ÷ units) | tree depth |
| Global Qty *(spec only)* | Units outstanding (firm-wide) | `globalUnits` |
| NAV | NAV | `nav` |
| Price before / Price after *(spec only)* | Current mark / Repriced mark | `currentPrice` / `revisedPrice` |
| Value before / Value after *(spec only)* | Look-through value / Repriced value | `derived` / `revised` |
| Δ Price *(spec only)* | Change in unit price | `revisedPrice − currentPrice` |
| Δ Value (P&L) *(spec only)* | Repricing gain or loss | `levelPnL` |
| Δ bps *(spec only)* | Repricing gain or loss in bps | `bps` |
| apex / terminal chips | Top-level feeder / Lowest level | role, not a figure |
| scen a / scen b *(spec only)* | NAV below look-through / NAV above look-through | bridge leg sign |
| Immediate % | Direct share *(subtitle: "of the level below")* | `directShare` |
| Applied % | Effective share *(subtitle: "of the product")* | `effectiveShare` |
| Cumulative % | Effective share of the searched position | `cumulativeShare` |
| mv100 / Value of 100% | Value of the whole entity | `wholeEntityValue` |
| Carried MV *(spec only)* | Book value of the stake (as booked) | `bookValue` |
| Position MV *(spec only)* | Position value (attributed to product) | `positionValue` |
| Variance *(spec only)* | Look-through minus as-booked | `derived − positionValue` |
| in tol | Within tolerance | verdict, not a figure |
| no NAV / `nonav` | No NAV reported | verdict, not a figure |

## 4. The two collisions the original had

Both are removed by the mapping above. Both are quoted from the original so the fix is auditable.

### "Repriced MV" meant two different quantities

`renderWaterfall` (line 1069) computes `startV = af ? R : D` and labels that first step
`af ? 'Repriced MV' : 'Derived MV'`. So under After Pricing, the step labelled **Repriced MV**
carries `R` — the *revised* quantity — which the very next step also shows, labelled **Revised MV**.
Meanwhile `renderTable` (line 1354) relabels the *Derived MV* column to **Repriced MV** under the
same toggle, and `renderTree` (line 1092) relabels the same column header while its cells read
`liveMVof(n)` (line 906, `afterMode() ? revMVof(n) : n.derived`). And the glossary card is titled
`'Derived MV / Repriced MV'`, defining the pair as one thing.

Net effect for a reader: **Repriced MV** denotes the look-through-value quantity in the glossary,
the revised quantity in the waterfall, and — depending on which basis is active — either one in the
tree. Two labels ("Repriced MV", "Revised MV") over one quantity in one view; one label over two
quantities across views.

**Resolved by** naming the two quantities separately and never reusing a word: `derived` is always
**Look-through value** (with "at repriced marks" appended when the basis makes it the repriced
roll-up) and `revised` is always **Repriced value**. The two are never both called "repriced"
without a qualifier, and the qualifier is part of the label rather than a nearby caption.

### "Applied" was used for a price and for an ownership share

The original renders **Applied px** (9 occurrences — the After-mode relabel of *Current px*, a unit
price) and **Applied %** (5 occurrences — the product's effective ownership share). Same adjective,
one for money-per-unit and one for a proportion; and the sole visual difference is the unit suffix.

**Resolved by** dropping "Applied" entirely: the price becomes **Repriced mark** and the share
becomes **Effective share (of the product)**.

## 5. Known gap

One live deviation from rule 1, recorded rather than hidden:

- `TREE_COLUMNS` in `src/ui/screens/reconciliation/tree.ts` gives the look-through column the fixed
  sub-label **"current marks"**, but its cells come from `reconcileNode` → `liveValueOf`, which
  returns the **repriced** quantity under the Repriced basis. Under that basis the column therefore
  reads "current marks" over repriced figures. The waterfall already handles this correctly
  (`derivedAfter`, "Look-through value at repriced marks"); the tree header must switch the same way
  before R10 and R11 can be scored PASS. Tracked in `docs/issues.md` §O11.

---

## 6. Precision rules

One rule per quantity class, implemented once in `src/domain/money.ts` and used by every screen.
Every formatter is pinned by unit tests and by `tests/baseline.json`, so a precision change shows up
as a parity diff rather than as a quiet reformat.

| Quantity class | Precision | Negatives | Formatter |
|---|---|---|---|
| **Money** (values, differences, P&L) | 0 dp, `en-US` thousands separators | `-$1,234` in prose; `($1,234)` in tables and beside a figure | `formatUsd` / `formatUsdParens` |
| **Money, to the cent** — where the simulator reports a reconciliation to the cent | 2 dp, thousands separators | `-$1,234.56` in prose; `($1,234.56)` in tables | `formatUsdCents` / `formatUsdCentsParens` |
| **Money, compact** — chips and graph halos only | `$2.06bn` (2 dp), `$412.5m` (1 dp), `$1,234` (0 dp) | leading `-`, or parentheses in the paren variant | `formatUsdCompact` / `formatUsdCompactParens` |
| **Unit prices** | 6 dp, always — a publish price is a six-decimal figure even when it is 1.000000 | leading `-` | `formatPrice` (plain) / `formatPriceGrouped` (thousands-separated) |
| **Unit-price change** | 6 dp, explicit sign | `-0.001234` | `formatPriceDelta` |
| **bps** | 1 dp, explicit sign, `bps` suffix — `+18.7 bps` | sign carries it | `formatBpsOf` (from a gap and a base) / `formatBpsSigned` (bare column) |
| **bps, 0 dp** — only two places, both inherited: the compact chips the original renders at 0 dp, and the plain-English break sentences (`ltFlag`, line 1082, uses `.toFixed(0)` inside prose) | 0 dp, explicit sign | sign carries it | `formatBpsCompact`; `describe()` in `src/ui/screens/reconciliation/detail.ts` |
| **Percentages** (direct, effective, cumulative share) | 2 dp, always both decimals, `%` suffix — `99.56%`, `3.10%` | leading `-` | `formatPercent` |
| **Unit counts** (units held, units outstanding) | 0 dp, thousands separators, rounded at the boundary only — the underlying figure keeps its cents | leading `-` | `formatCount` |
| **Nothing to show** | em dash `—`, never `0`, never blank inside a figure cell | — | `formatPrice`, `formatUsdCompact*`, `formatUsdCents*` return `—`; the tree renders `—` for an absent NAV and for a difference under $1 |

Two consequences worth stating, because they look like inconsistencies and are not:

- **`—` vs `$0`.** A dash means *no such figure* (no NAV reported, nothing beneath to look through).
  `$0` means *the figure exists and is zero* — which is exactly what the pricing difference must
  read under the Repriced basis, and why it renders as `$0` and `+0.0 bps` rather than as a dash.
- **Rounding happens at the edge only.** `formatCount(1330020204.24)` → `1,330,020,204`, but the
  figure carried into every share calculation keeps its cents; `tests/unit/ownership.spec.ts` pins
  both the exact value and the rendered string for that reason.
