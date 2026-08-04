# Vocabulary to-do — every R2 / R10 / R17 occurrence I could not reach

**Why this file exists.** R2, R7, R10 and R17 were fixed under a file ownership split: I owned
`src/ui/primitives/term.ts`, `src/ui/drawers/glossary.ts`, `src/domain/money.ts`,
`src/ui/screens/reconciliation/index.ts`, `src/ui/screens/pricing/index.ts`,
`src/ui/screens/pricing/score-strip.ts`, `src/ui/screens/diagnose/structure/index.ts` and
`src/ui/styles/glossary-terms.css`. Everything below renders a denylisted abbreviation, a duplicated
label or an off-rule precision **from a file I did not own**, so it is listed rather than changed.

**Line numbers were true at the time of writing** and four agents were editing the same tree, so
match on the quoted text, not on the line.

---

## 0. How to apply an entry (the whole recipe)

```ts
import { term, termAnnotate, termBindGlossary, termVocabularyLine } from '<path>/ui/primitives/term.js';

// once, at the top of a screen or lens mount — this is what makes every term on it live
termBindGlossary(store);

// (a) a whole string, pinned or not: every abbreviation in it becomes a glossary link and the
//     concatenated text is character-for-character unchanged, so the parity gate cannot notice
el('span', { ...parity('some.pinned.key') }, termAnnotate(theString))

// (b) one abbreviation you are building by hand
el('b', {}, [term('NAV', 'nav')])

// (c) the per-screen first-use expansion line, placed immediately after the screen question
termVocabularyLine(['nav', 'spv', 'vpm', 'bps'], 'ownership-vocabulary')
```

Rules that matter:

- **Never expand text that a baseline key pins.** `tests/baseline.json` holds 978 strict keys, read
  as `textContent`. `termAnnotate` adds and removes no characters; rewording does. Check a string
  with `python3 -c "import json;print([k for k,v in json.load(open('tests/baseline.json'))['values'].items() if v and 'YOUR TEXT' in v])"`.
- **Do not nest a `term()` inside another control.** A `role="button"` chip, a sortable `<th>`, an
  SVG graph node: a control inside a control is an R6 defect. Use route (a) — the vocabulary line —
  for those occurrences instead. This is why `src/ui/screens/reconciliation/index.ts` leaves the
  "Dangling SPV" / "Missing NAV" chip labels bare.
- **Do not `term()` a token that is the entire text of an element and is on
  `tests/e2e/rubric.spec.ts`'s `CODE_TOKENS`** (`lt`, `rfx`, `gls`, `iss`, `str`, `sim`, `own`,
  `gq`, `ltv`, `dcN`, `mv100`, `nonav`). That test flags a code token when it is an element's whole
  text, so wrapping one manufactures the finding. `termAnnotate` deliberately does not carry them.
- Available slugs are the 35 glossary slugs: `nav`, `product_nav`, `spv`, `vpm`, `vpm_symbol`,
  `bps`, `fund_code`, `double_count`, `co_ownership_multi_parent`, `missing_linked_security`,
  `apex_fund_feeder_terminal_fund`, `global_units_global_quantity`, `carried_mv_position_mv`,
  `derived_mv_repriced_mv`, `revised_mv`, `value_of_100_mv100`, `look_through`, `variance`,
  `ownership_immediate`, `applied_effective_ownership`, `publish_px`, `current_px_applied_px`,
  `revised_px`, `publish_px_vs_current_applied_px_vs_revised_px`, `repricing_p_l_p_l_reconciled`,
  `pricing`, `non_position`, `other_non_position_component`, `the_additive_reconciliation`,
  `reconciled`, `exception_break`, `before_vs_after_pricing`, `position_report`, `nav_report`,
  `allocation_tracker`. `termIsKnown(slug)` checks one.

---

## 1. Highest leverage: four places, and most of R2 closes

R2 passes an occurrence that is *either* expanded on first use on that screen *or* glossary-linked.
The critic's instrument (`docs/evidence/review-scripts/abbrev.mjs`) tests the expansion regex against
the **whole visible text of the screen**, so ONE vocabulary line fixes every occurrence on it —
including occurrences in files nobody wants to touch.

| # | File | What to add |
|---|---|---|
| 1.1 | `src/ui/chrome/shell.ts:184` | `el('span', { class: 'tagline', text: 'NAV pricing and look-through' })` → `el('span', { class: 'tagline' }, termAnnotate('NAV pricing and look-through'))`. This is the **first** `NAV` on all six screens, in the masthead, so no screen can claim first-use expansion until it is linked. Also `termBindGlossary(store)` in `wireShell`. |
| 1.2 | `src/ui/screens/diagnose/ownership/index.ts` | `termBindGlossary(store)` + `termVocabularyLine(['nav', 'spv', 'vpm', 'global_units_global_quantity'], 'ownership-vocabulary')` after `#ownership-question`. Measured now: `NAV` 1, `SPV` 11, `VPM` 1, `qty` 4 — all `expanded=false`/`null`. |
| 1.3 | `src/ui/screens/diagnose/data-quality/index.ts` | `termBindGlossary(store)` + `termVocabularyLine(['nav', 'spv', 'vpm'], 'data-quality-vocabulary')`. Measured: `NAV` 1, `SPV` 1, `VPM` 1, all `expanded=false`. |
| 1.4 | `src/ui/screens/diagnose/simulator/index.ts` | `termBindGlossary(store)` + `termVocabularyLine(['nav', 'spv', 'carried_mv_position_mv', 'global_units_global_quantity', 'publish_px_vs_current_applied_px_vs_revised_px', 'pricing', 'bps'], 'simulator-vocabulary')`. This is the worst screen: `NAV` 27, `px` 40, `SPV` 6, `DC` 3, `Δ` 2, `bps` 1, `qty` 2, `MV` 2. |

After 1.1–1.4 the three screens I owned already read `expanded=true` for every token the crawler can
measure (`NAV`, `SPV`, `VPM`, `MV`, `bps`, `DC`, `LTV`, `apex`); the remaining `null`-expansion
tokens (`px`, `qty`, `Δ`, `own`) have no expansion regex at all and must go the glossary-link route.

---

## 2. Occurrence list, by file

Route **(b)** = wrap with `term()` / `termAnnotate()`. Route **(a)** = covered by that screen's
vocabulary line once §1 lands; wrap as well where it is cheap and not nested in a control.

### 2.1 `src/ui/chrome/shell.ts` — chrome, therefore every screen

| line | text | token | slug | route |
|---|---|---|---|---|
| 20 | `question: 'Does NAV agree with what the product holds…'` (nav-link `title`) | NAV | `nav` | (a) — a `title`, so no control can be nested; leave |
| 72 | `"reported NAV, with today's pricing gaps & breaks still shown."` — `chrome.pricing_view_note`, **declared key** | NAV | `nav` | (b) `termAnnotate` |
| 77 | `'…every fund / SPV / holding valued at its repriced unit price, '` — `reconciliation.after.pricing_view_note`, **declared** | SPV | `spv` | (b) `termAnnotate` |
| 184 | `'NAV pricing and look-through'` (tagline) | NAV | `nav` | (b) — see §1.1 |
| 266 | `` `Pricing difference … · NAV ${formatUsd(...)}` `` (view figures) | NAV | `nav` | (b) `termAnnotate` |

Also in `shell.ts`, for R6d: add `data-glossary-term` to `STABLE_ATTRS` **or** rely on the unique
`id` every `term()` already carries (`#gterm-<slug>-<n>`) — the ids exist precisely so
`stableSelector()` can restore focus to the word that opened the drawer. Nothing to do unless the id
scheme changes.

### 2.2 `src/ui/screens/reconciliation/waterfall.ts`

| line | text | token | slug | route |
|---|---|---|---|---|
| 18 | `nav: 'NAV'` (waterfall step label, `.wf-label`) | NAV | `nav` | (b) |
| 63 | `'bottom-up NAV repricing'` (`.wf-op-basis`) | NAV | `nav` | (b) |
| 70 | `'NAV-repriced bottom-up'` — `reconciliation.waterfall.revised_basis`, strict | NAV | `nav` | (b) `termAnnotate` |
| 102 | `'sum of top-level feeder NAVs · NAV report'` — `…nav_basis`, **declared** | NAV | `nav`, `nav_report` | (b) `termAnnotate` |
| 138 | `` ` = NAV − ${…}` `` (tie detail) | NAV | `nav` | (b) |
| 150 | `` ` → NAV ${formatUsd(repricing.N)} · … funds` `` — feeds `reconciliation.status_line`; **already annotated by the caller** in `reconciliation/index.ts` | NAV | `nav` | done |
| — | `+1.9 bps`, `+7.7 bps` (`.wf-op-bps`, from `formatBpsOf`) | bps | `bps` | (a) — do **not** wrap a figure; the unit belongs to the figure |

### 2.3 `src/ui/screens/reconciliation/tree.ts`

| line | text | token | slug | route |
|---|---|---|---|---|
| 53 | `'the repricing model that gives every row its reported NAV did not arrive'` (error state) | NAV | `nav` | (b) |
| 63 | `'Hierarchy — fund ▸ SPV ▸ security'` — part of `reconciliation.tree.column_headers`, **declared** | SPV | `spv` | ✗ **do not wrap** — it is a sortable `<th>` control. Route (a). |
| 64 | `'VPM symbol'` | VPM | `vpm` | ✗ sortable `<th>`. Route (a). |
| 65 | `'NAV'` / sub `'reported'` | NAV | `nav` | ✗ sortable `<th>`. Route (a). |
| 67 | sub `'bottom-up from NAV'` | NAV | `nav` | ✗ sortable `<th>`. Route (a). |
| 69 | sub `'NAV − repriced'` | NAV | `nav` | ✗ sortable `<th>`. Route (a). |
| 104 | `' above this panel come from the NAV report and are unaffected — …'` | NAV | `nav` | (b) |
| 277 | `vehicle: 'SPV'` (row `.tag`) | SPV | `spv` | (a) — the tag sits inside a selectable row |
| — | row symbols `ASCHON-SPV`, `SPORTHLD - SPV`, `AP Dunk SPV, LLC` (fixture data) | SPV | `spv` | (a) — fixture identifiers, not app vocabulary |

### 2.4 `src/ui/screens/reconciliation/detail.ts`

| line | text | token | slug | route |
|---|---|---|---|---|
| 20 | `apex: 'Top-level feeder'` | — | — | already the expansion of `apex`; keep |
| 21 | `vehicle: 'SPV / fund'` | SPV | `spv` | (b) |
| 52–53 | `` `NAV is ${…} (${bps.toFixed(0)} bps) away from the bottom-up repriced value — assets or liabilities inside NAV, …` `` | NAV, bps | `nav`, `bps` | (b) — **and see §4.2, this is an unpinned 0 dp bps** |
| 91 | `pair('NAV', …)` | NAV | `nav` | (b) |
| 96 | `pair('Repriced value · bottom-up from NAV', …)` | NAV | `nav` | (b) |
| 105 | `'Non-position difference (NAV − repriced)'` | NAV | `nav` | (b) |
| 130 | `pair('NAV ÷ units outstanding', …)` | NAV | `nav` | (b) |

### 2.5 `src/ui/screens/pricing/bridge.ts`

| line | text | token | slug | route |
|---|---|---|---|---|
| 17 | `nav: 'Product NAV · USD'` (`.bridge-end-label`) | NAV | `nav` | (b) — **and see §3.1** |
| 24 | `'NAV above look-through value'` / `'NAV at or below look-through value'` | NAV | `nav` | (b) |
| 34 | `'Per-driver residual = apex NAV − its revised MV = …'` | NAV, MV, apex | `nav`, `revised_mv`, `apex_fund_feeder_terminal_fund` | (b) |
| 41 | `'Per-driver gap = top-level feeder NAV − its look-through value — …'` — `pricing.bridge.driver_caption`, **declared** | NAV | `nav` | (b) `termAnnotate` |
| 44 | `' = NAV above look-through / scenario b, '` | NAV | `nav` | (b) |
| 72 | `"sum of top-level feeder NAVs — the product's own NAV, "` — `pricing.bridge.product_nav_basis`, **declared** | NAV | `nav` | (b) `termAnnotate` |
| 106 | `'underlyings NAV-repriced · pricing reconciled'` | NAV | `nav` | (b) |
| 88, 144 | `+10 bps gap`, `+153 bps`, `-958 bps`, `+0 bps` (`formatBpsCompact`) | bps | `bps` | (a) — figures; and see §4.1 |

### 2.6 `src/ui/screens/pricing/price-table.ts`

| line | text | token | slug | route |
|---|---|---|---|---|
| 84 | `label: 'Current mark', after: 'Repriced mark'` | — | — | **§3.2 — two labels, one quantity** |
| 89 | `label: 'bps'` (column header) | bps | `bps` | ✗ sortable `<th>`; route (a) |
| 94, 237 | `'Top-level feeder'`, `tag-apex` | apex | — | already expanded; keep |
| 227 | `title: flag === 'nonav' ? 'No NAV reported' : …` | NAV, nonav | `nav` | (b) on the text, not the flag key |
| 354 | `` ` NAV × 10,000. ${rows.length} of … funds shown, as of ${asof}.` `` (table note) | NAV, bps | `nav`, `bps` | (b) `termAnnotate` |
| 98–103 | `pricingBpsChip` → `bps.toFixed(0)` | — | — | **§4.1 — call `formatBpsInteger`** |
| — | symbol cells `SPORTHLD - SPV` … ×20, row names `AP Sports … (DC), L.P.` ×3 | SPV, DC | `spv` | (a) — fixture identifiers; see §5.1 for `DC` |

### 2.7 `src/ui/screens/pricing/repricing-walk.ts`

| line | text | token | slug | route |
|---|---|---|---|---|
| 30 | `label: 'Global Qty'` — part of `pricing.walk.column_headers`, strict | Qty | `global_units_global_quantity` | ✗ sortable `<th>`; route (a) |
| 31 | `label: 'NAV'` | NAV | `nav` | ✗ sortable `<th>`; route (a) |
| 36–38 | `'Δ Price'`, `'Δ Value (P&L)'`, `'Δ bps'` | Δ, bps | `pricing`, `bps` | ✗ sortable `<th>`; route (a) |
| 269–271 | `"Money and NAV in USD, prices and Δ Price at 6 decimal places, units as counts, Δ bps = Δ Value ÷ the fund's own NAV × 10,000. … the deepest level prices from NAV ÷ units. As of ${asof}."` | NAV, Δ, bps | `nav`, `pricing`, `bps` | (b) `termAnnotate` — this note is the walk's best route-(a) home too |

### 2.8 `src/ui/screens/pricing/fund-detail.ts` (the pricing drawer)

| line | text | token | slug | route |
|---|---|---|---|---|
| 65 | `'Price to publish · NAV ÷ units'` — `pricing.detail.<CODE>.price_equations`, **declared** | NAV | `nav` | (b) `termAnnotate` |
| 97 | `'Repriced value · bottom-up from NAV'` | NAV | `nav` | (b) |
| 130–131 | `'Cur px'`, `'Rev px'` (holdings table headers) | px | `current_px_applied_px`, `revised_px` | (b) if the `<th>` is not sortable; else route (a) |
| 261 | `'No NAV reported'` | NAV | `nav` | (b) |
| 280 | `"The published price is the fund's own NAV divided by its units outstanding, …"` | NAV | `nav` | (b) |
| 299 | `'Per-holding gain or loss · held qty × (repriced price − current mark)'` | qty | `global_units_global_quantity` | (b) |
| 306 | `'+ Non-position difference (NAV − repriced)'` | NAV | `nav` | (b) |
| 310 | `'= NAV'` | NAV | `nav` | (b) |
| 313 | `'Reconciliation to NAV'` | NAV | `nav` | (b) |
| 318 | `'Non-position = assets/liabilities in NAV not captured in the positions report'` | NAV | `nav` | (b) |

### 2.9 `src/ui/screens/diagnose/index.ts` (the shared Diagnose chrome)

| line | text | token | slug | route |
|---|---|---|---|---|
| 46, 58 | `kind: fund.terminal ? 'FUND' : 'SPV'` (combobox option kind badge) | SPV | `spv` | (a) — inside a listbox option, so no nested control |
| 75 | `placeholder: 'Search any fund, SPV or security…'` | SPV | `spv` | ✗ a placeholder cannot hold a control — reword to `'Search any fund, holding vehicle (SPV) or security…'`, which is free text |
| 80 | `'No entity matches that. Clear the box to see every fund and SPV in this product.'` | SPV | `spv` | (b) |

### 2.10 `src/ui/screens/diagnose/ownership/*`

| line | text | token | slug | route |
|---|---|---|---|---|
| `owner-tree.ts:67` | `'SPV / FUND'` (row tag) | SPV | `spv` | (a) |
| `owner-tree.ts:79` | `` `Total qty: ${formatCount(total)}` `` — `ownership.<CODE>.total_qty`, strict | qty | `global_units_global_quantity` | (b) `termAnnotate` |
| `owner-tree.ts:116` | `'VPM symbol'` — part of `ownership.column_headers`, **declared** | VPM | `vpm` | ✗ sortable `<th>`; route (a) |
| `owner-tree.ts:117` | `'SPV fund code'` | SPV | `spv` | ✗ sortable `<th>`; route (a) |
| `owner-tree.ts:118` | `'Qty held'` | Qty | `global_units_global_quantity` | ✗ sortable `<th>`; route (a) |
| `owner-tree.ts:125` | `title: 'Direct share, was "Immediate %" — holder qty ÷ units outstanding of the row below.'` | qty | — | a `title`; leave |
| `derivation.ts:21` | `el('b', { text: 'qty ÷ total = direct share' })` | qty | `global_units_global_quantity` | (b) |
| `ultimate-owners.ts:28` | `'Direct share = holder qty ÷ total qty of the entity in the row below. '` — `ownership.APPOURI.footnote`, **declared** | qty | `global_units_global_quantity` | (b) `termAnnotate` |
| `index.ts:58` | `kind: x.inv ? 'SPV' : 'FUND'` | SPV | `spv` | (a) |
| `index.ts:160` | `placeholder: 'VPM symbol, fund name or code'` | VPM | `vpm` | reword the placeholder (free text) |
| `index.ts:167` | `'…or search the SPV fund code instead.'` | SPV | `spv` | (b) |

### 2.11 `src/ui/screens/diagnose/data-quality/*`

| line | text | token | slug | route |
|---|---|---|---|---|
| bucket titles (from `src/domain/exceptions.ts`) | `'Missing / dangling SPV code'` | SPV | `spv` | (a) — bucket headers are accordion controls |
| bucket titles | `'Unmapped identifiers (missing VPM symbol / name)'` | VPM | `vpm` | (a) |
| bucket titles | `'Self-mapping (fund holds its own code)'` | own | — | see §5.2 |
| `buckets.ts:28` | CSV header `'Severity,Bucket,VPM_Symbol,SPV_Code,…'` | VPM, SPV | — | export, not screen text — outside R2's crawl; see §5.3 |

### 2.12 `src/ui/screens/diagnose/simulator/*` — the largest cluster

| line | text | token | slug | route |
|---|---|---|---|---|
| `index.ts:23` | `'If this fund's value or units move, what happens to product NAV, and through which holders?'` | NAV | `nav` | (b) — the screen question; `termAnnotate` keeps R1's string byte-identical |
| `index.ts:33` | `'Click a node to shock its ', b('MV / Qty / NAV'), ' & hit ', b('Run')` | MV, Qty, NAV | `carried_mv_position_mv`, `global_units_global_quantity`, `nav` | (b) — **and the critic's separate finding stands: this help text names `Run`, `Run full reprice`, `Step by stage` and a `▤ Ledger` tray, none of which exist. Rewrite it to name the real controls.** |
| `index.ts:201–204` | `'Product NAV before any shock'`, `'…Σ top-level feeder NAV · the unshocked baseline every Δ below is measured against'`, `'no NAV reported'` | NAV, Δ | `nav`, `pricing` | (b) — **and §3.1: this is the Σ-feeder Product NAV** |
| `index.ts:238` | `el('b', { text: 'NAV' })` | NAV | `nav` | (b) |
| `index.ts:255` | `` `, ${fixture.maxlevel} levels deep. Concentration by feeder NAV: ${ranked}. ` `` | NAV | `nav` | (b) |
| `index.ts:257` | `` `Selected: ${selected} — NAV ${…}, unit price ${…}` `` | NAV | `nav` | (b) |
| `index.ts:260` | `` ` Last shock: …, product NAV moves ${…}.` `` | NAV | `nav` | (b) |
| `index.ts:321` | `'Product NAV '` | NAV | `nav` | (b) — **§3.1** |
| `graph.ts:117` | `'no NAV reported'` (SVG `<title>`) | NAV | `nav` | SVG text cannot hold an HTML button; reword to `'no net asset value reported'` — free text |
| `graph.ts:223–225, 301, 319–321` | `` `px ${formatPrice(price)}` `` — **40 SVG node captions, the single biggest count in the whole app** | px | `publish_px_vs_current_applied_px_vs_revised_px` | SVG: no button. Two options — (i) change the caption to `unit price 1.122812` (free text, no baseline key reads SVG captions), or (ii) keep `px` and rely on the simulator vocabulary line from §1.4. **(i) is the honest fix**; the rubric's own wording for `px` has no expansion regex, so route (a) alone cannot be measured. |
| `ledger.ts:78, 84` | `'Was "Derived MV"…'`, `'Was "Revised MV"…'` (`title`s) | MV | `derived_mv_repriced_mv`, `revised_mv` | `title`s; leave, or move into visible prose |
| `ledger.ts:82, 86, 88, 97` | `'…repriced from its own NAV'`, `'…in NAV but not held as positions'`, `'= Product NAV'`, `' a pricing break. Product NAV holds at '` | NAV | `nav` | (b) — **`ledger.ts:88` is `simulator.reprice.product_nav`, the Σ-feeder figure: §3.1** |
| `ledger.ts:166` | `el('th', { text: 'Δ NAV booked' })` | Δ, NAV | `pricing`, `nav` | (b) if that `<th>` is not a control |
| `ledger.ts:213` | `` `callout ${b.type === 'no NAV' ? …}` `` + its rendered text | NAV | `nav` | (b) on the rendered text |
| `reprice-run.ts:169` | `` ` node… repriced → holders · Δ ` `` | Δ | `pricing` | (b) |
| `reprice-run.ts:195` | `'✓ Reprice complete · every stage repriced · product reconciled to revised NAV'` | NAV | `nav` | (b) |
| `shock-panel.ts:18` | `hint: 'a move in MV flows through to NAV'` | MV, NAV | `carried_mv_position_mv`, `nav` | (b) |
| `shock-panel.ts:19` | `hint: 'firm-wide units (was global qty)'` | qty | `global_units_global_quantity` | (b) |
| `shock-panel.ts:20` | `label: 'NAV'` | NAV | `nav` | (b) if the label is not the control itself |
| `shock-panel.ts:77` | `'Pick any fund … to see its NAV, units outstanding, unit price, holders and holdings, then move its market value, units or NAV and press Run …'` | NAV | `nav` | (b) — and `Run` does not exist; see `index.ts:33` |
| `shock-panel.ts:102` | `` `Δ value at ${selected} …` `` | Δ | `pricing` | (b) |
| `shock-panel.ts:180, 197` | `'NAV (value)'`, `'No NAV reported'`, `['Fund', 'NAV', …]` | NAV | `nav` | (b) |
| `shock-panel.ts:193` | `['Holder', 'VPM symbol', 'Direct share', 'Units held']` | VPM | `vpm` | (b) |

### 2.13 `src/ui/screens/diagnose/structure/controls.ts`

| line | text | token | slug | route |
|---|---|---|---|---|
| 205 | `swatch('#1F4A4F', 'SPV / holding', 'An intermediate holding vehicle')` — part of `structure.legend`, **declared** | SPV | `spv` | (b) `termAnnotate` on the swatch label — the only bare token left on the Structure lens |
| 206 | `swatch('#6E2932', 'Ultimate', 'Lowest level — prices from NAV ÷ units')` | NAV | `nav` | (b) |
| 210 | `title: 'Derived MV is the look-through value at current marks'` | MV | `derived_mv_repriced_mv` | a `title`; leave |

### 2.14 `src/ui/drawers/sources.ts` (the Data-sources drawer)

R2 explicitly crawls drawers. Every row of the source table names a field, so this file has 15
occurrences. `sources.ts:48` and `:56` already expand `NAV` ("Net asset value"), which is the only
place in the app that did before this change; the rest are route (b) with `termAnnotate`.

| line | text | token | slug |
|---|---|---|---|
| 46, 57, 63, 100 | `'NAV Report'`, `'NAV Report (.csv)'` | NAV | `nav_report` |
| 58 | `'ENDING_NAV'` | NAV | — no whole-word match; leave |
| 62 | `figure: 'Product NAV'` | NAV | `product_nav` |
| 64 | `` `Σ ENDING_NAV over the top-level feeders (${feeders})` `` | — | already expands `apex` |
| 70, 112 | `'Quantity VPM, summed across holders'`, `'VPM symbol · Quantity VPM'` | VPM | `vpm`, `vpm_symbol` |
| 76 | `'Fund Entity · Fund Code · SPV Fund Code'` | SPV | `spv` |
| 82 | `'MV USD'` | MV | `carried_mv_position_mv` |
| 98, 101 | `'Repriced value (NAV, bottom-up)'`, `'Deepest funds price at NAV ÷ units, …'` | NAV | `nav` |
| 111 | `'VPM accounting system'` | VPM | `vpm` |
| 289 | `'SIM'` | sim | — a scene code in a data row; consider renaming |
| 316 | `"feeders' ENDING_NAV, which the reconciliation uses, and the single fund-entity NAV stamp, "` | NAV | `nav` — **and §3.1: this sentence is the other half of the two-Product-NAV story** |

### 2.15 `src/domain/exceptions.ts` — the chip and bucket vocabulary, rendered on three screens

The strings live in the domain layer, which may not import UI code, so `term()` cannot be applied
here. They must be wrapped **at the render site** (`reconciliation/index.ts` chips —
deliberately not wrapped, see §0 — and `data-quality/buckets.ts` accordion headers), or route (a).

| line | text | token |
|---|---|---|
| 73, 142, 171 | `'Missing NAV'`, `'Held funds with no ENDING_NAV in the NAV report'` | NAV |
| 97 | `` `NAV ÷ units = … is not positive — check the units or the NAV sign.` `` | NAV |
| 153, 179 | `'Dangling SPV'`, `'Referenced as an SPV but has no positions to look through'` | SPV |
| 173, 175, 176, 177 | `'NAV vs bottom-up value … — cash / fees / receivables'`, `'Repricing to NAV moves value …'`, `'NAV ÷ units is not positive'` | NAV |

### 2.16 `src/domain/reconciliation.ts` — the waterfall's step labels

`reconciliation.ts:63, 70, 71, 76, 79, 84` still carry the ORIGINAL vocabulary in the `label`
fields — `'Derived MV'`, `'Repriced MV'`, `'Revised MV'`, `'Δ Pricing'`, `'Δ Non-position'`,
`'Σ apex ENDING_NAV · NAV report'`. `Derived MV`, `Revised MV`, `Δ Pricing` and `Δ Non-position` are
on `tests/e2e/rubric.spec.ts`'s `PHRASE_TOKENS` and are matched as substrings, so any of them that
reaches the screen fails the shipped test as well as the rubric. Check which of these labels are
still rendered (the waterfall overrides most of them) and route the survivors through
`termAnnotate`, or rename in `docs/rename-map.json`-declared keys only.

---

## 3. R10 — labels that still name two quantities

### 3.1 "Product NAV", the Σ-top-level-feeder side

Fixed on the fund-entity side (`structure/index.ts`: the pinned figure now sits beside a
`· fund-entity basis` qualifier and the readout group is named "Product NAV on the fund-entity
basis"). The Σ-feeder side is in three files I do not own and still reads plain "Product NAV":

| file:line | rendering | parity key | what to do |
|---|---|---|---|
| `src/ui/screens/pricing/bridge.ts:17` | `'Product NAV · USD'` | label is untagged; the figure is `pricing.bridge.product_nav` | append a sibling `· Σ top-level feeders` qualifier, exactly as `structure/index.ts` does. `pricing.bridge.product_nav_basis` already says "sum of top-level feeder NAVs" — promote it next to the label. |
| `src/ui/screens/diagnose/simulator/ledger.ts:88` | `'= Product NAV'` | `simulator.reprice.product_nav` (**strict** — "= Product NAV $2,062,198,835.86") | the label is inside the pinned string: add an adjacent, untagged `· Σ top-level feeders` span. Do **not** reword. |
| `src/ui/screens/diagnose/simulator/index.ts:201, 321` | `'Product NAV before any shock'`, `'Product NAV '` | `simulator.baseline*` | `:201` already carries "Σ top-level feeder NAV" in its basis line; `:321` needs the qualifier. |

Then add the machine check R10's bar names and `docs/labels.md` claims: a label→quantity table,
asserted unique in **both** views. It does not exist.

### 3.2 "Repriced mark" and "Repriced unit price" — two columns, one value

`src/ui/screens/pricing/price-table.ts:84–85`. Under the Repriced basis the `curPx` column
relabels to `'Repriced mark'` while `revPx` stays `'Repriced unit price'`, and `:272` renders
`mark`, which under that basis IS `fund.revPx` — so SPORTA shows `1.011702` twice and the current
mark becomes unobtainable.

**This one is free to fix.** I checked: no baseline key contains the string `Repriced mark`, so the
after-view header row is not pinned. Either
- keep both columns and label `curPx` **`Current mark (unchanged)`**, still rendering `fund.curPx`
  under both bases — best, because the current mark is the thing a controller is comparing against;
  or
- drop the `curPx` column under the Repriced basis entirely.

Do **not** leave two headers over one number.

---

## 4. R17 — the bps precision rule, and the two callers that still bypass it

`src/domain/money.ts` now states one rule per quantity class and names, in its docstring, the exact
baseline keys that force each exception:

- **the rule** — `formatBps` / `formatBpsOf`: 1 dp, explicit sign, ` bps` suffix;
  `formatBpsSigned`: the same 1 dp with the unit hoisted to a column header (R3).
- **E1** — `formatBpsCompact`, 0 dp signed with suffix. Forced by `pricing.bridge.gap_bps`
  ("+10 bps gap") and `pricing.bridge.driver.{SPORTHLD,ASCHON,DUNK}.gap_bps` ("+153 bps",
  "-958 bps", "+0 bps") plus the `…gap_usd` composites — all STRICT keys.
- **E2** — `formatBpsInteger`, 0 dp unsigned with no suffix. Forced by the 26 STRICT
  `pricing.fund.<CODE>.pnl_bps` keys ("23", "22", "1", "0", "—").

### 4.1 `src/ui/screens/pricing/price-table.ts:98–103` — inline `bps.toFixed(0)`

```ts
export function pricingBpsChip(fund: RepricingFund, view: PricingView): string {
  if (view === 'after') return '0';
  const bps = bpsOf(fund.pnlLevel, fund.nav);
  return bps == null ? PRICING_DASH : bps.toFixed(0);        // ← replace
}
```
→ `return formatBpsInteger(bps);` (import from `../../../domain/money.js`). Same output, and the
variant becomes a named, documented exception instead of a third undocumented format.

### 4.2 `src/ui/screens/reconciliation/detail.ts:52, 57` — an UNPINNED 0 dp bps

```
`NAV is ($1,588,498) (22 bps) away from the bottom-up repriced value — …`
`Repricing the underlyings from their own NAVs moves value by ($385,897) (22 bps) against …`
```
No baseline key contains either sentence — I checked both — so **this one is not a parity
constraint, it is simply off-rule.** Replace `${bps.toFixed(0)} bps` with `${formatBps(bps)}` in
both branches of `describe`. That is a fourth precision the critic did not even count, and the only
one with no excuse.

### 4.3 `src/glossary/terms.ts:180` — a fifth rendering, also unpinned

`glossaryFacts()` builds the worked example with `bps: bps.toFixed(0)`, and
`src/glossary/terms-value.ts` renders it as `**${f.bps} bps**` → `23 bps`: 0 dp, unsigned, with a
suffix. Only `glossary.term.bps.definition` is in the baseline (the `plain` field); **no key pins any
worked example** — all 42 `glossary.*` keys are definitions, chips, headers and the intro. So this is
free: `bps: formatBpsSigned(bps)` gives `+23.2`, which the template turns into `+23.2 bps` — the
rule. The card that *defines* bps should not render bps off-rule.

### 4.4 The rest of the class

`formatBpsOf` / `formatBpsSigned` are already the only bps formatters used by
`reconciliation/waterfall.ts`, `pricing/score-strip.ts` and `pricing/repricing-walk.ts`. After 4.1,
4.2 and 4.3 land, `grep -rn "toFixed(0)" src/ | grep -i bps` should return hits only inside
`src/domain/money.ts` — the two declared exceptions and the docstring that names their keys.

---

## 5. The crawler, and three judgement calls a reviewer should see

### 5.1 `tests/e2e/rubric.spec.ts:34–40` — the denylist is 11 tokens short of the rubric's 26

The shipped crawler carries its own 12 code tokens and 14 phrases, and drops the rubric's `MV`,
`px`, `qty`, `apex`, `NAV`, `bps`, `SPV`, `VPM`, `Δ`, `FR`, `DC`. The rubric lists all 26 and the
test must use all 26. Replace the two arrays with the rubric's set and match **whole-word**, not
whole-element:

```ts
const CASE_SENSITIVE = ['MV', 'LTV', 'NAV', 'SPV', 'VPM', 'FR', 'DC', 'Δ', 'bps'];
const LOWER = ['lt', 'rfx', 'str', 'sim', 'iss', 'own', 'gls', 'px', 'qty', 'gq', 'apex', 'nonav', 'mv100', 'dcN'];
const PHRASES = ['in tol', 'scen a', 'scen b'];
```

and give each occurrence a **disposition** rather than a pass/fail, because the rubric's bar is
disposition-based: an occurrence passes if the text node is inside `.gterm` /
`[data-glossary-term]` (route (b)) **or** the screen's visible text matches that token's expansion
regex (route (a) — reuse the regexes in `docs/evidence/review-scripts/abbrev.mjs`). Emit
`docs/evidence/abbreviations.json` as `{ token, route, screen, context, disposition }` and fail only
on `disposition: 'bare'`. Without the disposition half, the test cannot express the criterion it is
checking. **`tests/` is not mine to edit.**

### 5.2 `own` is the English word, not a label

Every `own` hit on every screen is prose — "the product's **own** NAV", "repriced from its **own**
NAV", "fund holds its **own** code". The rubric means a tab called `own`; the rebuild has no such
control (the lens is "Ownership"). The shipped test's own comment says as much. Recommend the
crawler keep `own`, `lt`, `sim`, `str`, `iss` **whole-element** and everything else whole-word — and
say so in the evidence file, so a critic sees a reasoned disposition instead of a silent omission.

### 5.3 `DC` is part of a legal entity name

All ten `DC` occurrences are inside fixture entity names — "AP Deuce Intermediate Holdings I (DC),
L.P.", "AP Sports Intermediate Holdings Velocity (DC), L.P.", "AP Sports Debt Holdings II (DC),
L.P." — where `(DC)` is part of the registered name, **not** the app's `double-count`. I did not
link them to the `double_count` glossary card, because that would tell a controller something
false. The screens I owned instead say "double-count" in their own prose, which satisfies the
crawler's `/double[- ]count/i` expansion honestly. Recommend the crawler skip a token that occurs
only inside a value drawn from fixture data, and record that decision.

### 5.4 Exports are outside R2, but carry the same vocabulary

`src/export/csv.ts:71, 112, 116, 172, 198` and `src/export/excel.ts:72, 87, 90, 165, 207` write
`'NAV USD'`, `'VPM symbol'`, `'Respective Qty'`, `'Local MV'`, `'= NAV'`. R2 crawls rendered
screens, so these are not findings — but R13 requires the file to agree with the screen, so if a
screen header is renamed the export header should move with it. Nothing to do now; noted so the two
do not drift.
