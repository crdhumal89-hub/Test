# UX scorecard — third independent pass

**Who wrote this.** An independent reviewer. I did not design or build this application, I did not
write any of its tests, and I did not read `docs/ux-scorecard.md` or `docs/ux-scorecard-2.md` before
grading. I read `docs/ux-rubric.md` first, before any other file in the repository, and every score
below is against that file's words.

**Commit graded.** `0e7a247` — *"All six reviewed issues fixed — including a real defect in the upload
recompute path"*. `git rev-parse --short HEAD` → `0e7a247`.

**Method.**

1. `npm run build` (vite 8.2.0, 69 modules, 215.18 kB JS), then `npx vite preview --port 5199
   --strictPort`, driven with Playwright/Chromium at 1600×1000, `en-US`, `UTC`, `reducedMotion:
   reduce`. Readiness by `await page.waitForFunction(() => !document.documentElement.dataset.fetching)`
   followed by a MutationObserver quiet period.
2. I ran the shipped suite myself: **156/156 unit tests pass**, **117/117 e2e tests pass** (116 `app`
   + 1 `offline`), `npm run lint` passes (eslint + 5 gate scripts), `npm run typecheck` passes,
   `npm run gate:parity` passes with **1020/1020 keys, 978 strict, 42 declared-label, 0 digit
   violations, 0 diffs**.
3. **I then ignored those results as evidence of the rubric.** For every criterion I read what the
   shipped test actually asserts, compared it with what the rubric demands, and where the test was
   narrower I measured the criterion myself. My probes are in
   `docs/evidence/critic3-scripts/` (own Playwright config, `pw.config.ts`, pointed at port 5199 so
   nothing under `tests/` is touched) and my measurements in `docs/evidence/critic3-*.json` plus 20
   screenshots. Where I re-used the app's own R2 crawler and grader I imported them unmodified, so a
   finding cannot be dismissed as my grader being stricter than theirs.
4. I verified document claims with commands rather than reading them. Results in **"Claims I could
   not verify"** below.

---

## Result

| | Count |
|---|---|
| **PASS** | **15** |
| **FAIL** | **3** — R2, R7, R17 |

**Gate verdict: FAIL.** `docs/ux-rubric.md:220` — "PASS only if all 18 are PASS with cited evidence."

This is a strong application and the count understates it. I attacked R6, R13, R15 and R16 hard and
could not break any of them; three of those four are materially better than the tests that claim them.
R4 — a documented failure in the previous pass — now holds under my own fault injection on every panel
the criterion enumerates. The three failures are narrow and specific:

- **R2** fails on **one surface the crawler still never visits**: the reconciliation tree after
  *Expand all*. The app's own unmodified grader reports `DC BARE ×12 of 12` there.
- **R7** fails on the one clause of its bar that no shipped test exercises: *with a drawer already
  open*. The open Data sources drawer physically covers the Glossary button.
- **R17** fails for the reason `docs/halt-r17.md` gives. I verified that argument independently and it
  is true; the conclusion is honest, not an excuse. It is still a FAIL on the rubric's words.

---

## Per-criterion

Every row cites evidence I collected on commit `0e7a247`. No row is graded from a document's claim.

### R1 — Every screen states, in one line at the top, the question it answers · **PASS**

I measured every `.screen-question` / `.lens-question` on all six routes
(`docs/evidence/critic3-r1.json`, probe `measure.spec.ts:57`). All ten question elements are visible,
end in `?`, and are within the 140-character bar — longest is the shared Diagnose question at **103**
chars ("Why is this entity off — how is it wired, who owns it, is its data sound, and what happens if
it moves?"); the six others are 58–91. Painted position: `#reconciliation-question` and
`#pricing-question` at y=182, the Diagnose screen question at y=144, each lens's own question at
y=344–382, i.e. the screen question paints above everything else in `#screen`.

The shipped test is in two halves and the second half is the strong one:
`tests/e2e/rubric.spec.ts:28` takes only `.first()` (DOM order), but
`tests/e2e/rubric-order.spec.ts:202-207` sorts **every** element in `#screen` that carries its own
text by `getBoundingClientRect()` and asserts the topmost is inside the question — the criterion's own
geometric wording — and `:238-245` bounds the question's y by a value derived from
`#screen`'s content top plus the question's own height rather than by a literal. I read that code and
it is not weaker than the bar.

On Diagnose routes two question sentences are visible (the screen's and the lens's). I read "each
top-level screen **and each Diagnose lens** renders exactly one" as satisfied by one each, which is
what ships.

### R2 — No user-visible bare abbreviation survives outside the glossary · **FAIL**

**What fails.** On `#/reconciliation`, after clicking `#expand-all`, the token `DC` appears **12
times** with neither an expansion on that screen nor a glossary link.

Measured with the app's **own** `vocabCrawl` and `vocabGrade`, imported unmodified from
`tests/e2e/vocabulary-crawler.ts` / `vocabulary-grade.ts` (probe
`docs/evidence/critic3-scripts/r2-dc.spec.ts`, output `docs/evidence/critic3-r2-dc.json`, screenshot
`docs/evidence/critic3-r2-dc-expanded.png`):

```
collapsed tree: 10 rows   → DC occurrences: 0
expanded tree : 150 rows  → DC occurrences: 12, disposition "BARE ×12 of 12"
```

Four are **rendered text**, in `.row-name`:
`"AP Deuce Intermediate Holdings I (DC), L.P."`, `"AP Sports Intermediate Holdings Velocity (DC),
L.P."`, `"AP Sports Debt Holdings II (DC), L.P."`. Eight are `aria-label`s on the row and its twisty
(`"Open the breakdown for AP Deuce Intermediate Holdings I (DC), L.P."`).

**Why this is the app's own standard, not mine.** Pricing and all four Diagnose lenses disclose exactly
this case in their vocabulary strip: *"DC = double count — and, inside a registered entity name below,
part of that name."* The Reconciliation strip does not — I read it out of the running page:

```
"Terms on this screen: NAV = net asset value · SPV = special purpose vehicle ·
 VPM = the valuation portfolio accounting system · bps = basis points, one hundredth of a percent."
```

**Smallest honest fix.** Add `double_count` to the Reconciliation screen's vocabulary list (one array
entry, alongside `nav`, `spv`, `vpm`, `bps`), and add the expanded tree to the R2 crawl.

**The crawl scope question I was asked to adjudicate.** The crawl is now much wider than it was — five
chrome hosts, four attributes (`title`, `aria-label`, `aria-description`, `placeholder`), both drawers,
and 16 driven empty/error states. It is still not as wide as *"every screen, lens, drawer, table
header, chip, tooltip and empty state"*. I crawled ten surfaces it never visits
(`docs/evidence/critic3-r2-wider.json`, probe `r2-wider.spec.ts`):

| Surface never crawled by the shipped suite | Occurrences I read | Bare tokens |
|---|---|---|
| **reconciliation, tree expanded + a row's detail panel** | 1,787 | **`DC` ×12** |
| pricing, "Repricing walk" subview, healthy path (12 headers incl. `Global Qty`, `Δ Price`, `Δ Value (P&L)`, `Δ bps`) | 1,007 | none |
| pricing, **Repriced (After) view** — every relabelled header | 1,000 | none |
| pricing, After view + walk subview | 1,000 | none |
| pricing, fund-detail panel (row clicked) | 1,094 | none |
| reconciliation, Repriced view | 274 | none |
| ownership, tree expanded + inspector + rollup | 713 | none |
| data quality, all five bucket bodies expanded | 437 | none |
| simulator, after a shock has been run | 577 | none |
| glossary term card (deep-linked) | 1,022 | none |

Credit where due: nine of the ten uncrawled surfaces are clean. One is not, and it is the one a
controller reaches with the most prominent button on the landing screen.

**Is the "plausible gloss" rule sound, or gameable?** The rule (`vocabulary-grade.ts:82-96`) requires
every letter of the token to appear in the gloss in order with the first letter opening a word, and it
correctly refuses the three coincidences it was written for. Three residual loosenesses exist:

1. **Shape 1 (`TOKEN = gloss`) is credited with no correspondence test at all** — any `token: <lower
   case>` within 44 characters counts. Deliberate, and I accept the reasoning (`px = unit price` and
   `apex = the top-level feeder funds` have no letters to correspond). But it is the shape doing *all*
   the work in this app: I dumped every credited expansion on all six routes and **every single one is
   shape 1 from the per-screen vocabulary strip** (`abbreviations-pricing.json`,
   `abbreviations-diagnose-ownership.json`, and my `critic3-r2-variants.json`). No coincidental gloss
   is currently excusing anything.
2. **Flagging non-word-like tokens is case-sensitive** (`vocabBounded(token)`, no `i` flag), so `Qty`
   in `"Global Qty"` and `"Qty held"` is not matched at all, and `GQ` (the fixture's break detail says
   `"held (GQ 200000000) but no ENDING_NAV"`) would not be either. I re-graded all six routes plus the
   expanded tree with matching made fully case-insensitive: **the findings are identical**
   (`critic3-r2-variants.json`, `V2_caseInsensitive`). The hole is real but currently excuses nothing —
   those columns are glossary-linked or covered by the strip.
3. **`VOCAB_WORDLIKE` holds 8 tokens** but only `own` and `apex` are ordinary English words; word
   boundaries alone already stop `str` firing inside "Structure". Re-graded with WORDLIKE reduced to
   `{own, apex}`, the only extra hit is `sim` (2 occurrences, both in the sources drawer).

**On `sim` / `SIM`.** The rubric's `sim` is the original's *tab id*; this app renders no such tab. It
renders `SIM` as the original's *dataset name*, glossed in place as `"SIM (simulator)"` in the table
cell (`src/ui/drawers/sources.ts:285`) and in the prose above it. I judge that disposition
**legitimate** — the reader meets the token and its meaning in the same cell, which is route (a). But
it is *unverified by the suite in both directions*: `sim` is in `VOCAB_WORDLIKE`, so an element reading
`"SIM (simulator)"` is never flagged; and crediting is case-exact, so if it were flagged the in-cell
gloss would **not** discharge it. The elaborate comment at `sources.ts:273-284` implying the crawler
now grades this correctly is not true (see "Claims I could not verify").

### R3 — Every displayed figure carries a unit and an as-of date · **PASS**

**The shipped test measures none of the unit half.** `tests/e2e/rubric.spec.ts:50-85` walks each route
in viewport steps and asserts the as-of is visible whenever any figure is — which is a good, honest
implementation of the *second* half of the bar. But it counts `#screen [data-parity]` elements and
never inspects a single unit. It writes `docs/evidence/units-and-asof.json`; the rubric names
`docs/evidence/units.json`. So the entire clause *"every numeric figure is unit-marked at the point of
reading"* was ungraded, and this PASS rests on my measurement alone.

**My measurement** (probe `measure.spec.ts:88` then `measure2.spec.ts:49`, outputs
`docs/evidence/critic3-r3-units.json`, `critic3-r3-pass2.json`): I enumerated every element in
`#screen` whose own text nodes contain a digit run and which has a non-zero box — **607 figure-bearing
elements across the six routes** (reconciliation 65, pricing 196, structure 55, ownership 157, data
quality 10, simulator 124) — and resolved a unit for each from, in order: its own text, a
`.figure-unit` sibling, its table column header, or an ancestor's text within four levels.

**605 of 607 resolve to an explicit unit.** The residual are the data-quality bucket counts, which
render as `"2 · High"`, `"9 · Medium"` in `.dq-count` with no unit token
(`docs/evidence/critic3-r3-dq.json`, screenshot `critic3-r3-dq-buckets.png`). Their noun is stated in
the same panel, 40px above: `#data-quality-kpi` reads *"High severity 31 Medium 52 Low 22 **Total
issues** 105"*. The reconciliation exception chips are the same shape (`<span class="chip-count">5</span>
<span class="chip-label">Missing NAV</span>`) with the noun in the chip's `title`: *"Held **funds** with
no ENDING_NAV in the NAV report"*.

I grade this **PASS**: the bar's list of acceptable marks ends "…or a column header that carries the
unit", i.e. the unit may live on the panel rather than the glyph, and it does. A stricter reader can
disagree with the exact figures above in hand — that is why I recorded them. The as-of half I confirm
independently: `#asof` is in the sticky masthead, `position: sticky`, and my own scroll walk found no
step on any route with figures on screen and no as-of.

### R4 — Every data-dependent panel has a defined loading, empty, and error state · **PASS**

The criterion **enumerates** its panels; I checked every one, driving the states myself rather than
trusting the suite.

| Panel the rubric names | Loading | Empty | Error | `role=alert` on error | Recovery |
|---|---|---|---|---|---|
| reconciliation tree | ✓ | ✓ | ✓ | **alert** (I measured; no shipped test checks it) | "Reload this product's data" |
| price table | ✓ | ✓ | ✓ | **alert** (unchecked by shipped test) | "Reload…" / "Clear the filter" |
| repricing walk | ✓ | ✓ | ✓ | **alert** (unchecked by shipped test) | "Reload…" |
| Structure lens | ✓ | ✓ | ✓ | alert | "Reload…" |
| Ownership lens | ✓ | ✓ | ✓ | alert | "Try again" |
| Data quality lens | ✓ | ✓ | ✓ | alert | "Try again" |
| Simulator lens | ✓ | ✓ | ✓ | alert | "Reload…" |
| NAV upload slot | ✓ | ✓ | ✓ | alert | "Choose a different file" |
| Position upload slot | ✓ | ✓ | ✓ | alert | "Choose a different file" |
| lazily-fetched universe | ✓ | ✓ | ✓ | alert | "Try again", and it recovers |
| combobox result lists | 1 of 3 | **3 of 3** | 1 of 3 | alert on the inner span | "Clear the box…" |

Evidence: `docs/evidence/critic3-r4.json` (probe `measure5.spec.ts:56`). I served
`lookthrough.json` with every `path` deleted and with `nodes: []`, `repricing.json` with every fund's
`ltv`/`rev` non-numeric, aborted `universe.json`, and read each state's `role`, text and buttons out of
the DOM. The three states the shipped tests never check for announcement — tree, price table, walk —
all carry `role="alert"`; structurally this is guaranteed because `errorState()`
(`src/ui/primitives/dom.ts:109`) is the **only** producer of `.state-error` in `src/` and hard-codes
`role: 'alert'`. Empty states carry `role="status"` and a recovery button.

**The upload slots are real.** I counted `input[type="file"]` = **2** in the drawer
(`#sources-file-position` accepting xlsx, `#sources-file-nav` accepting csv), and both have three
driven states.

**The one soft spot.** `createCombobox` takes an optional `notice` (loading/error), and only *one* of
the three comboboxes passes it — `#diagnose-entity` (`src/ui/screens/diagnose/index.ts:146`).
`#ownership-search` and `#data-quality-scope` pass none. I checked whether that leaves a panel blank
and it does not: with `universe.json` aborted, **neither combobox is mounted at all** (`count = 0`) and
the lens itself shows `role="alert"` + "Try again". Their empty states exist and name a recovery — I
read all three out of the page (`docs/evidence/critic3-r18.json`). So no panel renders blank, renders a
bare `—`, or throws. PASS — but "every combobox result list" is driven for one of three, which belongs
in the test-gap section below.

### R5 — A first-run user reaches the primary answer on each screen with no instruction · **PASS**

`docs/evidence/above-the-fold.json`, regenerated by the suite run I performed: **79 rows across 6
routes, 0 not above the fold**, with `window.scrollY === 0` asserted at the end of each route. Six
screenshots at 1600×1000 (`docs/evidence/fold-*.png`).

I checked the previous pass's finding that R5 asserted a selector absent from its own contract
document, and it is **closed**. My first automated pass flagged 6 of 46 rows
(`docs/evidence/critic3-r5-contract.json`, probe `check-r5-contract.mjs`) — that was my own
false positive: `docs/first-run.md` names all six, in abbreviated form (line 57 splits
`` `#reconciliation-waterfall .wf-step`, `.wf-op` ``; line 58 writes "and its `.wf-basis`"; lines 59
and 83 elide with `…delta_pricing_bps`, `…delta_nonposition_usd`, `…delta_nonposition_bps`,
`…delta_pricing_detail`). I checked each by hand against the document. All 46 asserted rows are named
in the contract.

For Diagnose, the entity is pre-selected: `#diagnose-entity` reads `APPOURI` on arrival on all four
lenses (my own read, `critic3-r7.json` → `perLens`), so no lens is empty.

### R6 — Keyboard focus is visible on every interactive element, and every control is reachable · **PASS**

This is the strongest thing in the repository, and I could not break it.

My own measurements (`docs/evidence/critic3-r6.json`, `critic3-r6-keyboard.json`, probes
`measure3.spec.ts:230`, `measure4.spec.ts:49`), for each click target the bar names **by name**:

| Target | Count | Role | Named | Keyboard |
|---|---|---|---|---|
| sortable table headers | 9 | `columnheader`, `tabindex=0` | "Sort by Fund", … | ✓ |
| accordion headers | 5 | real `<button>`, `aria-expanded="false"` | ✓ | Enter toggles: bodies 0 → 1, `aria-expanded` → `"true"` |
| graph nodes | 46 | `role="button"` on every `<g>` | "ASCHON — Apollo Sports Capital Holdings (Onshore), L.P., 100.00% of its holder" | roving tabindex: 1 tabbable; my arrow trail `ArrowRight→ASCHON, ArrowRight→DUNK, ArrowDown→SPORTHLD, ArrowLeft→DUNK`; Enter/Space activate (`controls.ts:227-232`) |
| ribbon segments | 39 | `role="button"`, `tabindex=0`, 178×16 px | "Apollo Credit Strategies Master Fund Ltd., 11.45% — go to its row" | ✓ |
| flag chips | 3 | `role="button"`, `tabindex=0`, 118×32 px | "Jump to the first fund flagged Missing NAV" | ✓ |
| tree rows | 150 | ✓ | ✓ | ✓ |

The shipped `rubric-focus.spec.ts` is genuinely strong and not weaker than its bar: it measures ring
width, computes WCAG contrast against the *nearest painted background* for both ring tones, rejects
zero-area stops, scans the live CSSOM for `outline:none` without a `:focus-visible` replacement, and —
the part I would not have thought of — **photographs** each control focused and unfocused and requires
the pixels to differ, which is the only way to catch a ring clipped by `overflow: hidden`. Drawer focus
trap, Esc, and restore-on-close are asserted for both drawers and for the row-detail drawer by
`data-node-id`.

### R7 — The glossary is reachable from every screen in one action · **FAIL**

**What fails.** *With a drawer already open*, which the bar names explicitly, the Glossary button is
physically covered by the drawer and a single click cannot reach it.

Measured (`docs/evidence/critic3-r7.json`, probe `measure3.spec.ts:48`; screenshot
`docs/evidence/critic3-r7-drawer-covers-glossary.png`):

```
#/pricing, #open-sources clicked, drawer open:
  #open-glossary box            : x=1384 y=14 w=80 h=31   (still in the DOM, still "visible")
  document.elementFromPoint(centre) → header.drawer-head
  that element .closest('#drawer-host') → true
  glossary cards after a real click dispatched at the button's centre → 0
```

The Data sources drawer is a right-hand panel from x≈1140 that overlays the whole masthead, including
the basis toggle, Glossary and Data sources buttons. The screenshot shows it: there is no Glossary
button on screen at all.

The keypress route is only conditionally available:

```
focus at #sources-close  (where the drawer's focus trap puts it) → 'g' → 35 glossary cards   ✓
focus at #sources-file-nav (one Tab away, inside the same drawer) → 'g' → 0 cards, drawer still open  ✗
```

`wireShell` (`src/ui/chrome/shell.ts:382-384`) suppresses the shortcut whenever the focused element is
an `INPUT`, and the sources drawer contains two file inputs. From that state the glossary costs
**Escape then click, or Escape then `g` — two actions**, which is the bar's own failure clause: "Fails
if: … needs two actions from anywhere."

Everything else in R7 passes, and I measured it: one click from all six routes and all four lenses
yields **35 cards** every time; `Escape` closes it; the pre-selected entity survives (`APPOURI` before
and after on all four lenses); the keyboard route `g` works from a screen; and a glossary-linked label
deep-links — clicking the masthead's `NAV` opens the drawer with 35 cards
(`docs/evidence/critic3-r7-deeplink.png`).

**Smallest honest fix.** Either (a) exempt `input[type=file]`/`type=search` from the `typing` guard so
the documented keypress holds everywhere inside a drawer, or (b) render the glossary opener inside the
drawer chrome as well, so a single click exists while a drawer is open. (a) is one condition in
`shell.ts`.

**No shipped test exercises this clause.** `tests/e2e/rubric.spec.ts:204` loops the six routes with no
drawer open, and never tests the deep link either.

### R8 — Every defect found in the original is resolved or carried with a reason · **PASS**

I ran the named machine check myself:

```
$ node scripts/check-issues.mjs
inventory      : 33 items, 33 present
dispositions   : 11 rows, 6 carried, 0 undisposed
stale claims   : 0
ISSUE REGISTER CHECK PASSED
```

I read the script rather than trusting it. Its `INVENTORY` (`scripts/check-issues.mjs:30-52`) is a
hard-coded transcription of the spec's defect list, and it additionally holds `STALE_CLAIMS` — regexes
over the register paired with predicates that fail when the repository *contradicts* a disposition,
which is a genuinely unusual and valuable check. Spot-verified in `docs/issues.md` myself:
`lth-live-s`, `grandVar`, `2,785.79`, `ABFSUB6`, `CAXXXII`, `outline:none` all present, 35 disposition
markers. It runs inside `npm run lint`, which I ran and which exits 0.

### R9 — One definition of every business rule · **PASS**

My own greps:

```
$ grep -rn "250_000\|250000\|250,000" src/
src/glossary/terms-nav.ts:119  (prose in a definition)
src/glossary/terms-nav.ts:120  (alsoFind search alias)
src/domain/exceptions.ts:12    export const MATERIAL_USD = 250_000;
$ grep -rn "MATERIAL_BPS\s*=\|WARN_BPS\s*=\|BAD_BPS\s*=" src/
src/domain/exceptions.ts:13,16,17   — all three, one module
```

Exactly one executable definition. `tests/unit/rules.spec.ts:133-264` is stronger than the bar: it
pins the alias to `terms-nav.ts:120` by exact location so a real comparison appearing in that file
fails; it asserts the *negative* (no comparison anywhere against 250,000, and no comparison against
50/25 on any line in the materiality vocabulary); it asserts the truncation table is `{8,10,12,14,40,
200}` and that **no key is dead** — a declared-but-unread constant means a panel typed the number
instead; and it enumerates the three remaining raw literals that share a magnitude, each a
string-length cap rather than a row limit. 9/9 pass.

### R10 — No two different quantities share a user-visible label · **PASS**

**No machine check ships.** The bar names one ("a label→quantity table in `docs/labels.md`,
machine-checked for uniqueness in both Before and After views"); `grep -rln "labels.md" scripts/ tests/`
returns nothing. So I built one.

I collected every table header on all six routes in **both** bases and mapped each to the
`data-parity` family of the first cell beneath it (`docs/evidence/critic3-r10-r11.json`,
`critic3-r10-duplicates.json`, probe `measure2.spec.ts:182`). Three label strings appear against more
than one family — `Fund`, `Symbol`, `NAV` — and all three are the *same* quantity in two tables (fund
identity, symbol, the fund's reported NAV in the walk and in the simulator's holder table). No label
resolves to two quantities in either view.

I then hunted the two traps the rubric names by name:

- **"Applied"** (a price in one place, an ownership share in another, in the original): **zero
  occurrences** in `#screen` on Pricing or Ownership, in either basis.
- **"Repriced MV"** for two quantities: every "Repriced…" label is distinct and basis-explicit —
  `Repriced unit price`, `Repriced value`, `Repriced mark` (After only), `Repriced look-through value`,
  `Look-through value at repriced marks`.

### R11 — Every figure states its basis · **PASS**

The $2,785.79 dual product NAV — the case this criterion exists for — survives and is
distinguishable on sight. Both renderings, read out of the running page
(`docs/evidence/critic3-r11.json`, probe `measure3.spec.ts:130`):

```
#/reconciliation waterfall : NAV $2,062,198,836      basis line "sum of top-level feeder NAVs · NAV report"
#/diagnose/structure readout: "Product NAV $2,062,196,050.07 · fund-entity basis
                              One entity stamp, not the sum of the top-level feeders — every other screen shows that one."
#structure-basis            : "Two product net asset values (NAV) exist and both are right, so neither is
                              labelled just "Product NAV". … Product NAV, fund-entity basis $2,062,196,050.07 …
                              Every other screen shows Product NAV, Σ top-level feeders $2,062,19…"
```

Both figures unchanged, both labelled, neither labelled just "Product NAV". Every view-sensitive header
relabels when the basis flips — measured in both views:

| Current marks | Repriced |
|---|---|
| `Look-through value current marks` | `Look-through value at repriced marks` |
| `Pricing difference repriced − look-through` | `Pricing difference reconciled` |
| `Current mark` | `Repriced mark` |
| `Repricing gain or loss` | `Repricing gain or loss (reconciled)` |
| waterfall step 1 `LOOK-THROUGH VALUE … look-through of underlyings · current marks` | `LOOK-THROUGH VALUE AT REPRICED MARKS … every component at its repriced price` |

No shipped test asserts any of this. R11 has no test at all.

### R12 — The pricing view is never ambiguous and never offered where it is meaningless · **PASS**

My own per-route measurement (`docs/evidence/critic3-r12.json`, probe `measure5.spec.ts:132`):

```
#/reconciliation      toggle 31px, note 38px, tag "Before pricing"
#/pricing             toggle 31px, note 38px, tag "Before pricing"
#/diagnose/simulator  toggle 31px, note 38px, tag "Before pricing"
#/diagnose/structure  toggle 0px [hidden], note 0px
#/diagnose/ownership  toggle 0px [hidden], note 0px
#/diagnose/data-quality toggle 0px [hidden], note 0px
```

`aria-pressed` is on both segments. The shipped `rubric.spec.ts:239-287` is the rare case of a test
*stronger* than I would have written: it flips the basis and diffs `#screen`'s `textContent` on all six
routes, requiring the text to change on exactly the three routes that offer the control and on no
others — so "this screen is basis-insensitive" is measured, not asserted. It also checks that `hidden`
actually produces zero height, which a `display:flex` rule used to defeat.

### R13 — Exports produce a file, and the file agrees with the screen · **PASS**

My own independent tie-outs, parsing the downloaded bytes (`docs/evidence/critic3-r13.json`, probe
`measure4.spec.ts:187`):

```
Reconciliation CSV, Repriced basis  row 0: "Pricing basis,Repriced,Product,Apollo Sports Capital,As of,2026-06-30"
                                    product row, NAV USD = 2062198835.86   screen = $2,062,198,836   ✓
Send-to-pricing CSV                 "SPORTHFCSPV,117634387.19,1.025389,120620994.57"
                                    Local Price 1.025389 = pricing.fund.SPORTHFC.publish_px 1.025389  ✓
Reconciliation workbook             sheets [Summary, Reconciliation], 35,595 bytes
Pricing workbook                    sheets [Summary, Pricing],        34,509 bytes
```

The shipped `tests/e2e/exports.spec.ts` is not the "check the file size" test the project's history
warns about. It parses the CSV with a real splitter and the workbooks with SheetJS 0.18.5 from their
own bytes, then compares **spot figures against the string the screen is rendering at that moment**
via `data-parity` (`expTie`, `:163-173`), counts ties to ≥3 per export as the bar words it, runs every
export in **both** bases, and asserts the look-through CSV is *not* byte-identical across bases — which
is the regression that would otherwise let one file silently disagree with one screen. 4/4 pass.

### R14 — Nothing fails silently · **PASS**

- `grep -rn "console\." src/` → **two comment lines only**
  (`structure/graph.ts:217`, `simulator/data-state.ts:56`, both saying `src/` may not call it).
- `eslint.config.js:20` → `'no-empty': ['error', { allowEmptyCatch: false }]` for `src/**/*.ts`. I ran
  `npm run lint`: exits 0.
- `grep -rn "catch" src/` returns **10 lines in 8 files** — one is a comment
  (`structure/graph.ts:153`), the other **nine are handlers, and I read every one**. All surface into
  the UI or rethrow, none is empty: `sources-upload.ts:323` records and renders `errorState`;
  `structure/graph.ts:288` calls `structureShowGraphError` **outside** the SVG and records;
  `data/load.ts:69,77` wrap and rethrow as `FixtureError`; `main.ts:64-66` sets
  `universeStatus:'failed'` then `throw error`; `main.ts:126` renders a boot `errorState`;
  `reconciliation/index.ts:95` and `pricing/index.ts:122` append an `role="alert"` export error to the
  toolbar (the original alerted and gave up); `data-quality/index.ts:107` and `ownership/index.ts:125`
  replace the lens with `errorState`.
- Console listeners across my ~45 driven states (six routes, ten extra scenes, sixteen fault
  injections, four offline exports): **zero** `console.error`, **zero** `pageerror` except the two
  deliberate rethrows the state tests assert. Their own 117-test run: clean.

### R15 — The app runs with the network disabled · **PASS**

**The shipped offline test is narrower than the bar in two named ways.** The bar says "all three
screens, all four lenses, **both drawers and all four exports** work". `tests/e2e/offline.spec.ts:25-32`
visits the six routes and opens **only the glossary** — it never opens the sources drawer and never
runs an export. The exports are the one feature that needs the vendored spreadsheet library, so the
untested part is exactly the part that would break.

So I ran the criterion's own scope myself (`docs/evidence/critic3-r15-offline.json`, probe
`measure4.spec.ts:118`), aborting every non-origin request:

```
blockedRequests : []          consoleProblems : []
6 routes         : question visible on all; 58 / 560 / 145 / 143 / 20 / 81 figures
glossary drawer  : 35 cards
sources drawer   : 4,609 chars of text, 2 file inputs
exports          : lookthrough CSV 22,515 B · reconciliation xlsx 35,551 B
                   send-to-pricing CSV 995 B · pricing xlsx 34,509 B
workbook sheets  : recon [Summary, Reconciliation]   pricing [Summary, Pricing]
```

Zero outbound requests attempted, no degradation. PASS on my evidence, not theirs.

### R16 — Selection survives navigation · **PASS**

The shipped test (`rubric.spec.ts:313`) covers lens switches and a drawer. It does **not** cover the
pricing-view toggle (its comment says "and a basis flip" but no basis flip is in the code) and does not
cover any of the screen-level state the bar names — expanded tree rows, sort column, filter text. So I
measured all four (`docs/evidence/critic3-r16.json`, probe `measure.spec.ts:299`):

```
expanded tree rows : 150 → leave to Pricing → return → 150            survived
filter text        : "SPORT", 15 rows → leave → return → "SPORT", 15 rows
sort column        : clicked col 3; first row "Apollo Sports Capital (Onshore), L.P. ASCON ASCON-SPV 1.11770",
                     1 cell with aria-sort ≠ none → leave → return → identical first row, 1 aria-sort cell
selection across basis toggle : "SPORTHFCSPV" → click Repriced → "SPORTHFCSPV"
```

All four hold. The state lives in `src/state/store.ts` rather than in the DOM, which is why.

### R17 — Numeric precision is consistent and documented · **FAIL**

**What fails.** One quantity class — bps — is rendered at two precisions in two places on the same
screen, one click apart. Read out of the running page
(`docs/evidence/critic3-r17.json`, probe `measure.spec.ts:367`):

```
#/pricing, price table    "bps" column        decimal counts observed: [0]   ASCHON = "2"
#/pricing, walk subview   "Δ bps" column      decimal counts observed: [1]   ASCHON = "+1.9"
#/pricing, bridge         ASCHON gap_bps                                     "-958 bps"
#/reconciliation          waterfall bps                                      "+1.9 bps" / "+7.7 bps"
```

Same fund, same computed quantity (`bpsOf(fund.pnlLevel, fund.nav)`, written identically in
`price-table.ts` and `repricing-walk.ts`), three renderings. The rubric's fail clause is exactly this:
"the same quantity class is rendered at two precisions in two places."

Every other class is consistent, and I measured that too: money 0dp with separators
(`$1,768,255,188`), unit prices 6dp in both the price table and the walk (`1.024650`, `1.139585`),
percentages 2dp, counts 0dp.

**I verified `docs/halt-r17.md`'s argument independently, and it is true.** From
`tests/baseline.json` (read-only for me, read directly):

```
pricing.fund.ASCHON.pnl_bps         = "2"          26 such keys, 0dp
pricing.walk.fund.ASCHON.delta_bps  = "+1.9"       26 such keys, 1dp
pricing.bridge.driver.ASCHON.gap_bps= "-958 bps"    4 gap_bps keys, 0dp
APCAXXII: "2" vs "+2.0"      APRAIL2: "22" vs "+22.2"      APAEV: "0" vs "+0.0"
```

Both families are compared byte-for-byte: `docs/rename-map.json` has **42** keys and
`npm run gate:parity` reports **42 declared-label keys** — I ran both — and none of the 30 bps keys is
among them, so all 30 are strict. Rendering `pnl_bps` at 1dp changes a digit and fails
`gate:parity`, which I confirmed passes today at 1020/1020 with 0 diffs. The digit guard would also
refuse it as a declared relabel. The two frozen artifacts genuinely cannot both hold.

**Is the conclusion honest or an excuse?** Honest. Three tests of that:
(1) the halt document grades itself FAIL and says so in its own words — "An independent critic still
grades R17 FAIL, and I agree with that grade: documented variance is still variance";
(2) the work that *could* be done without a decision was done and I verified it —
`grep -rn "toFixed(0)" src --include=*.ts` returns **no call** outside `src/domain/money.ts`, and the
two exceptions E1/E2 are declared in the module docstring with the exact strict keys that force them;
(3) it does not quietly amend the rubric. What I would push back on is one stale sentence it inherits —
see "Claims I could not verify".

**Smallest honest fix.** None available inside the constraints; it needs the owner's decision between
re-cutting the baseline at 1dp (which moves a reported figure) and amending R17. Graded FAIL as it
stands.

### R18 — Empty and zero results have a recovery path · **PASS**

I drove all three comboboxes, the filter, and the lens-with-no-data states myself
(`docs/evidence/critic3-r18.json`, `critic3-r4.json`):

```
#diagnose-entity    "No entity matches that. Clear the box to see every fund and SPV in this product."
#ownership-search   "No position in the firm-wide universe matches that. Clear the box to see everything,
                     or search the SPV fund code instead."
#data-quality-scope "No fund entity matches that. Clear the box to see all of them, or pick
                     "All fund entities" to scan the whole universe."
#pricing-filter     "No fund matches "zzzz". All 26 funds are still here."  + button [Clear the filter]
tree empty          "…has no look-through rows as of 2026-06-30…"           + button [Reload this product's data]
universe error      "…could not be loaded…"                                 + button [Try again], and the retry
                                                                             really recovers (APPOURI findable after)
```

Every empty state names a next action; the ones with a button have a working one. The original's
non-actionable "no matches" dead end is gone. The shipped R18 test checks **one** of these five
(`rubric.spec.ts:337`, the `#diagnose-entity` combobox only) — the rest of the coverage comes from the
R4 state suites, which do assert recovery buttons.

---

## Tests weaker than their criterion

The most useful section. For each criterion: does the shipped assertion reach the rubric's bar?

| # | Shipped test | Reaches the bar? | The gap, with file:line |
|---|---|---|---|
| R1 | `rubric.spec.ts:23-40` + `rubric-order.spec.ts:129-256` | **Yes** | `rubric.spec.ts:28` grades only `.first()` in DOM order, so on a Diagnose route the four **lens** questions are never length- or `?`-checked. `rubric-order.spec.ts` closes the "at the top" clause properly (painted geometry, derived bound). |
| R2 | `rubric-vocabulary*.spec.ts` + `vocabulary-crawler.ts` + `vocabulary-grade.ts` | **No** | Denylist is now read back out of the frozen rubric (`vocabulary-crawler.ts:107-112`) — that hole is closed. Scope still misses: the **expanded tree** (`#expand-all`; 10 rows crawled of 150 — this is where the live `DC` defect is), the **walk subview**, the **Repriced view**, the **fund-detail and row-detail panels**, expanded **bucket bodies**, the **post-shock simulator**. Matching is case-sensitive for 18 of 26 tokens (`vocabulary-grade.ts:192`), so `Qty`/`GQ` cannot be flagged. `VOCAB_WORDLIKE` protects 8 tokens where word boundaries already suffice for 6. |
| R3 | `rubric.spec.ts:50-85` | **No — half the bar is unmeasured** | Asserts the as-of well (a real scroll walk, honest). Measures **zero units**, though the bar's first clause is "every numeric figure is unit-marked". Counts `[data-parity]` elements as a proxy for "figures". Emits `units-and-asof.json`; the rubric names `units.json`. |
| R4 | `states*.spec.ts` (4 files, 30 tests) | **Almost** | Every enumerated panel is driven by real fault injection with screenshots — strong. `role=alert` is asserted for 6 error states but **not** for the tree (`states.spec.ts:58`), price table (`:113`) or walk (`:178`); I measured all three and they are `alert`. "Every combobox result list" is driven for 1 of 3. |
| R5 | `rubric.spec.ts:161-201` | **Yes** | 46 rows, all traceable to `docs/first-run.md`, geometry + `scrollY === 0`. The earlier "selector absent from the contract" defect is closed. |
| R6 | `rubric-focus.spec.ts` | **Yes, exceeds it** | Ring width, WCAG contrast against the real painted background, dual-tone separation, zero-area rejection, CSSOM `outline:none` scan, screenshot-diff proof the ring is painted, focus restore on all three overlays. |
| R7 | `rubric.spec.ts:204-226` | **No** | Loops six routes with **no drawer open**, so the bar's "and with a drawer already open" clause is untested — and it is the clause that fails. The bar's last sentence ("Clicking a glossary-linked label anywhere opens the glossary *at that term*") and its named deep-link test are also absent. |
| R8 | `scripts/check-issues.mjs` | **Yes** | 33-item inventory *plus* stale-claim predicates that fail when the repo contradicts a disposition. |
| R9 | `tests/unit/rules.spec.ts` | **Yes, exceeds it** | Positive and negative halves, alias pinned by exact location, no-dead-constant check, raw literals enumerated with reasons. |
| R10 | **none** | **No test exists** | The bar names "machine-checked for uniqueness in both Before and After views". `grep -rln "labels.md" scripts/ tests/` → nothing. I built the check. |
| R11 | **none** | **No test exists** | The bar names "DOM assertion on both product-NAV renderings and on every view-sensitive column header, in both views". Nothing asserts either. I measured both. |
| R12 | `rubric.spec.ts:239-298` | **Yes, exceeds it** | Flips the basis and diffs `#screen` text on all six routes, so "changes nothing here" is measured. |
| R13 | `exports.spec.ts` (4 tests) | **Yes** | Real parse of real bytes, ≥3 spot figures tied to on-screen strings per export, both bases, plus a "the two bases must differ" guard. Not a file-size check. |
| R14 | `helpers.ts:22-29` + eslint | **Yes** | Console + `pageerror` listener on essentially every test; `no-empty` with `allowEmptyCatch:false` on `src/**`. |
| R15 | `offline.spec.ts` | **No** | The bar says "both drawers and **all four exports**". The test opens only the glossary and runs **no export** — precisely the features that need the vendored `xlsx`. I ran the full scope; it passes. |
| R16 | `rubric.spec.ts:313-335` | **No** | Covers lens switches and a drawer. Omits the **pricing-view toggle** (its own comment claims a "basis flip" that is not in the code) and all three screen-level states the bar names — **expanded tree rows, sort column, filter text**. I measured all four; all pass. |
| R17 | **none** | **No test exists** | The bar names "a formatter unit-test matrix, plus a rendered-text scan asserting the decimal count per column". Neither exists. Consistent with a documented FAIL, but it means the *other* precision classes are also unguarded; I scanned them and they are consistent. |
| R18 | `rubric.spec.ts:337-347` | **Partly** | One of five empty states, and the assertion is a loose regex `/clear|try|widen|every/` over lower-cased text. The R4 state suites carry the real coverage. |

**Net: 7 of 18 criteria have a shipped test that does not reach the criterion's bar (R2, R3, R4, R7,
R15, R16, R18), and 3 have no test at all (R10, R11, R17).** Of the ten, nine still pass when I measure
the criterion properly. Two of the three failures I found live exactly in the gaps (R2 in the uncrawled
expanded tree, R7 in the untested drawer-open clause), which is the pattern worth acting on: this
project's residual risk is concentrated in what its tests decline to look at, not in what they look at
and get wrong.

---

## The upload feature, read critically

`src/domain/ingest/` (3 files), `src/ui/drawers/sources-upload.ts`, proved by
`tests/unit/ingest-roundtrip.spec.ts` (12 tests) and `ingest-refusals.spec.ts` (16). No rubric
criterion grades numeric fidelity here, and `parity-map.json` carries zero upload entries, so this is
outside the scorecard — but I was asked to read the proof.

**Is the oracle real, or does the code compare against itself?** Real. `data/…/repricing.json` is
lifted verbatim from the original artifact — `npm run fixtures:check` (which I ran) reports *"ok
repricing.json matches REVBASE in the original"* — and it carries `revByFund`, `R`, `D`, `dPricing`,
`dNonPos` and per-fund `rev`/`ltv`/`curPx`/`revPx`/`pnlLevel` as **the original's own computed
figures**. So `applyNavOnly(...)` landing on `SHIPPED_REPRICING.revByFund` to the bit is a genuine
external check, not a tautology. Likewise `lookthroughFromPositions` must reproduce all **149** tree
nodes field-for-field, including the subtrees a fund held on two chains carries twice, from a file in
which each `(holder, investee)` edge and each fund's securities were written **once**
(`report-serialise.ts:125-146`). That is a real reconstruction; it cannot close by accident.

**Where the proof genuinely stops, and the document says so:** `report-serialise.ts:11-13` states that
the header spellings are the ones the reader's own `positionColumns` / `navColumnIndex` match. So the
round trip proves the *arithmetic*, not that a real Apollo Position Report's headers are accepted. That
is a candid limit, correctly labelled.

**Are the "genuinely lossy" exclusions legitimate?** Five exclusions; I checked each against `src/`:

| Excluded from comparison | Legitimate? | My check |
|---|---|---|
| `lookthrough.dcN` (2,061,528,573.1 → 0) and `recon` (23 rows → []) | **Yes** | No reader. `grep -rn "dcN" src/` → a comment, the type, and the emit site. `grep -rn "\.recon\b" src/` → one hit, and it is `legacyPricing.recon`, a different object. |
| `funds[].secs` / `nSecs` | **Yes** | `grep -rn "\.secs\b\|nSecs" src/` → **nothing**. |
| `holders[].sym` | **Yes** | `pricingHoldersTable` (`fund-detail.ts:179-198`) renders `holder.h`, `ownpct`, `units` only. |
| `holdings[].carried` | **Yes** | `grep -rn "h\.carried\|holding.carried" src/` → nothing. The tree node's `carried` **is** rendered ("Book value of the stake", `reconciliation/detail.ts:119`) and **is** compared — `treeNodes()` drops only `holder`, which the shipped fixture does not carry. |
| `SPORTHLD.nHolders` 23 → 15 | **Convenient, but declared with its size** | `nHolders` **is** user-visible: `"Held by · 23 holders firm-wide"` (`reconciliation/detail.ts:174`) and `"Who holds SPORTHLD · 23 holders firm-wide"` + `"Showing the largest 10 of 23"` (`fund-detail.ts:326-330`). After a position-report upload those read 15. The cause is real — the fixture records `nHolders: 23` while listing 14 holders (capped at `TRUNCATE.simHolders`), which I confirmed — so the loss is the oracle's, and the test asserts the residual to the unit (`135113791.48999977`). But the round trip cannot distinguish "the oracle truncated" from "the reader miscounts" for this one fund; the other 25 match exactly, which is what makes it credible. |

One further declared divergence: break `detail` wording changes (`"held (GQ 200000000) but no
ENDING_NAV in the NAV report"` → `"held but no ENDING_NAV"`). The pairing of fault to fund is asserted;
the sentence is this port's. That is a user-visible string change after an upload, stated openly.

**The defect the round trip caught is real and was serious.** `structureFromTree` keyed parentage on
`node.holder`, a field the shipped `lookthrough.json` does not carry, so all 42 vehicles and 103 leaves
filed under `undefined` and every fund priced at its own NAV: a NAV-report upload returned
`R = $2,062,198,835.86` for a book worth `$2,060,610,338.29`, collapsing all `$1,588,497.57` of
non-position difference to zero and valuing CRIMAP at `$0` instead of `$1,190,008,859.58`
(`src/domain/repricing.ts:44-53`). It has exactly one production caller
(`sources-upload.ts:223`). The fix and the "securities counted once per fund, by taking the maximum
across appearances" argument both hold on this fixture; the maximum-across-appearances step rests on a
stated property of the tree ("the walk emits either the whole of a fund's leaf list or none of it")
which is true here and would need re-checking on a different dataset.

**Verdict on the proof: it is sound and unusually candid, and it is doing real work.** The single thing
I would still want is one end-to-end assertion that an uploaded file reproduces the *rendered* strings
the parity baseline pins — today the round trip stops at the model, and `states-upload.spec.ts:221-245`
checks only one figure (`$2,062,198,836`) through the DOM.

---

## Claims I could not verify, or found false

1. **`src/domain/money.ts:112`** — "Callers: `src/ui/screens/pricing/price-table.ts` only, which
   **currently inlines `bps.toFixed(0)`**". **False / stale.** `grep -rn "toFixed(0)" src` shows
   `price-table.ts:102` is now only a comment and the call routes through `formatBpsInteger`.
   `docs/halt-r17.md:23-24` flags this same staleness; the comment in `src/` was not updated.
2. **`src/ui/drawers/sources.ts:273-284`** — the comment argues that moving the `SIM` gloss into the
   table cell stops "the crawler … discharging the cell with a definition of a different thing" and
   "distinguishes the two referents by construction". The *reader-facing* claim is true. The
   *crawler-facing* claim is not: `sim` is in `VOCAB_WORDLIKE`, so an element whose text is
   `"SIM (simulator)"` is never flagged; and `vocabExpansionAt` is case-exact, so if it were flagged the
   in-cell gloss would not credit it either. Measured: `critic3-r2-variants.json` → `sim` is "absent"
   under the shipped grader on every route, and BARE ×2 under a grader with `WORDLIKE = {own, apex}`.
3. **`docs/first-run.md:~152`** — "`tests/e2e/rubric-order.spec.ts` requires a `.screen-question` /
   `.lens-question` element to be the first text painted on all six routes **and inside the first
   400px**". **Stale.** That test deliberately removed the 400px literal;
   `rubric-order.spec.ts:233-245` now derives the bound from `#screen`'s content top plus the
   question's own height. `grep -n "400" tests/e2e/rubric-order.spec.ts` finds it only in prose.
4. **`docs/first-run.md:124-158`, the `lens-question` git-history correction** — **verified TRUE**, and
   worth recording given the project's history of a bold false claim about git. I ran it:
   `git log --all --oneline -S"id: 'lens-question'" -- trace-pro/src` → exactly `b01ccd3` and
   `7752a15`; `grep -rn "lens-question" src/` → one line, `components.css:82`, a CSS rule with nothing
   rendering the class.
5. **`docs/first-run.md:315-322`, the second correction** — **verified TRUE**.
   `git show 1b630d2^:trace-pro/tests/e2e/rubric.spec.ts` shows the six selectors were two
   `[data-parity]` attribute selectors plus `#structure-caption`, `#ownership-checks`,
   `#data-quality-kpi`, `#simulator-runline`; `git grep "id: '<id>'" 1b630d2^ -- trace-pro/src` finds
   all four rendering at that commit.
6. **`docs/halt-r17.md:26-28`** — "parity 1020/1020, 978 strict, 42 declared-label, 0 digit violations,
   **0 diffs**". **Verified TRUE**; `npm run gate:parity` reproduces those exact numbers today.
7. **`docs/labels.md:22-26`** — "42 baseline keys … `docs/rename-map.json` → `keys` has 42 entries and
   `npm run gate:parity` reports '42 declared-label keys'". **Verified TRUE** (42 and 42). Note
   `npm run lint`'s `classify-keys` prints **41**, on the different basis the same paragraph explains.
8. **`tests/e2e/rubric.spec.ts:329`** — the comment "And across a drawer opening and closing, **and a
   basis flip**" describes a basis flip the test does not perform. Not a false claim about the app; a
   false claim about the test. I performed the flip myself and the selection survives.
9. **`docs/halt-r17.md:1-9`** — "Status: still awaiting your decision. Nothing has been amended." I can
   confirm the rubric is unamended (`docs/ux-rubric.md` §R17 still reads "bps 1dp") and that
   `tests/baseline.json` still pins `"2"` and `"+1.9"`. I cannot verify what any human replied, and I
   do not treat the document's account of that exchange as evidence either way.

---

## Gate verdict

**FAIL — 15 PASS, 3 FAIL (R2, R7, R17).**

The rubric's rule is absolute: "PASS only if all 18 are PASS with cited evidence"
(`docs/ux-rubric.md:220`). Three do not pass.

Two of the three are small and fixable today: one array entry for R2's Reconciliation vocabulary strip
(plus expanding the tree in the crawl), and one condition in `shell.ts`'s keydown guard for R7 (plus a
glossary opener reachable while a drawer is open). R17 is not the designer's to fix — two frozen
artifacts contradict each other, the analysis in `docs/halt-r17.md` is independently correct, and it
needs the owner to choose between moving a reported figure and amending the criterion.

Said plainly: this application is good, and better than a 15/18 suggests. Its figures tie to the
original at 1020/1020 with zero diffs; it runs with the network off including every export; its
keyboard, export and state-persistence behaviour survived deliberate attempts to break them and is
stronger than its own tests claim. What it still has is a habit of testing the surface it built rather
than the surface the criterion names — 7 of 18 shipped tests are narrower than their bar and 3
criteria have no test at all — and two of its three failures were sitting in those blind spots.

### Reproducing every number above

```
npm run build
npx vite preview --port 5199 --strictPort          # a free port, deliberately not 4178
npx playwright test --config docs/evidence/critic3-scripts/pw.config.ts
node docs/evidence/critic3-scripts/00-survey.mjs
node docs/evidence/critic3-scripts/check-r5-contract.mjs
node docs/evidence/critic3-scripts/inspect-counts.mjs
```

| Probe | Criterion | Output |
|---|---|---|
| `r2-wider.spec.ts` | R2 | `critic3-r2-wider.json`, 10 screenshots |
| `r2-dc.spec.ts` | R2 | `critic3-r2-dc.json`, `critic3-r2-dc-expanded.png` |
| `r2-variants.spec.ts` | R2 | `critic3-r2-variants.json` |
| `measure.spec.ts` | R1 R3 R16 R17 R18 | `critic3-r1.json`, `critic3-r3-units.json`, `critic3-r16.json`, `critic3-r17.json`, `critic3-r18.json` |
| `measure2.spec.ts` | R3 R10 R11 | `critic3-r3-pass2.json`, `critic3-r10-r11.json`, `critic3-r10-duplicates.json` |
| `measure3.spec.ts` | R3 R6 R7 R11 | `critic3-r7.json`, `critic3-r11.json`, `critic3-r6.json`, `critic3-r3-dq.json` |
| `measure4.spec.ts` | R6 R7 R13 R15 | `critic3-r6-keyboard.json`, `critic3-r13.json`, `critic3-r15-offline.json`, `critic3-r7-drawer-covers-glossary.png` |
| `measure5.spec.ts` | R4 R12 | `critic3-r4.json`, `critic3-r12.json` |
| `check-r5-contract.mjs` | R5 | `critic3-r5-contract.json` |
