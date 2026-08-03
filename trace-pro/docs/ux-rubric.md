# TRACE-Pro — UX Rubric

**Authored:** Phase 0, before any application code exists. **Frozen** at Phase 0 approval.

This file is the definition of "user friendly" for this rebuild. It is written now, against the
original, so that it cannot drift to fit whatever gets built. If a criterion later looks wrong, the
rule is: **halt and say why — do not amend it and continue.**

## How this is graded

Every criterion is scored **PASS** or **FAIL**. There is no partial credit and no "N/A".

1. **Independence.** The grader reads this file as a reviewer who did not design the app, and who
   is looking for reasons to fail it. Scoring "it looks fine" is not scoring.
2. **Evidence or it did not happen.** Each criterion names the evidence that proves it. A score
   without citable evidence — a file:line, a DOM assertion in a named test, a screenshot path, or
   pasted command output — is recorded as **FAIL**.
3. **Automated where automatable.** Criteria marked ⚙ have a machine check that must exit 0. The
   critic still reads them, but the machine's output is the evidence.
4. **The whole rubric must pass.** One FAIL means the UX gate fails, and the gate is not
   negotiable by the designer.

Evidence lands in `docs/evidence/` (screenshots, DOM dumps) and `docs/ux-scorecard.md` (the
scored table, regenerated each critic pass).

---

## Seeded criteria

### R1 — Every screen states, in one line at the top, the question it answers ⚙
**Bar:** each top-level screen and each Diagnose lens renders exactly one visible sentence, ≤ 140
characters, phrased as a question, as the first text in its content region — before any control or
figure. It is real text in the DOM, not a tooltip, not placeholder text, not `aria-label` only.
**Evidence:** DOM assertion per screen in `tests/e2e/rubric.spec.ts` capturing the actual string;
screenshot per screen.
**Fails if:** the sentence is decorative filler ("Welcome to Pricing"), restates the screen title,
or appears below a figure.

### R2 — No user-visible bare abbreviation survives outside the glossary ⚙
**Bar:** a crawler walks the rendered text of every screen, lens, drawer, table header, chip,
tooltip and empty state, and matches against a denylist seeded from the original: `lt`, `rfx`,
`str`, `sim`, `iss`, `own`, `gls`, `MV`, `LTV`, `px`, `qty`, `gq`, `apex`, `nonav`, `in tol`,
`scen a`, `scen b`, `mv100`, `dcN`, `NAV` *(unexpanded on first use per screen)*, `bps`
*(undefined on first use per screen)*, `SPV`, `VPM`, `Δ` *(unlabelled)*, `FR`, `DC`.
An occurrence passes only if it is (a) expanded on first use on that screen, or (b) rendered as a
glossary-linked term that opens the definition in one action.
**Evidence:** crawler output listing every match and its disposition, committed as
`docs/evidence/abbreviations.json`.
**Fails if:** any denylist token appears with neither expansion nor glossary link. Controller
vocabulary (`bps`, `SPV`, `VPM`, `NAV`, `Δ`) is *kept* — it must be *defined*, not removed.

### R3 — Every displayed figure carries a unit and an as-of date ⚙
**Bar:** every numeric figure is unit-marked at the point of reading — currency symbol, `%`, `bps`,
`units`, or a column header that carries the unit — and every panel containing figures resolves to
a visible as-of date, either on the figure's panel or on a persistent chrome element visible
simultaneously with it. On a screen where the as-of is only in a collapsed panel, the panel counts
only if it is expanded by default.
**Evidence:** DOM assertion enumerating every figure-bearing element and the unit + as-of it
resolves to; the crawler emits `docs/evidence/units.json`.
**Fails if:** any bare number is readable with no unit, or a figure is visible while no as-of date
is (which is the failure mode when the original's top panel is collapsed via the hamburger).

### R4 — Every data-dependent panel has a defined loading, empty, and error state ⚙
**Bar:** three states, each *reachable in a test* and each carrying a plain-language sentence and,
for empty and error, a recovery action. Applies at minimum to: the reconciliation tree, the price
table, the repricing walk, all four Diagnose lenses, the two upload slots, every combobox result
list, and the lazily-fetched universe fixture.
**Evidence:** one test per panel per state (fixture withheld → loading; filtered to zero → empty;
fetch rejected → error), with screenshots.
**Fails if:** any panel renders blank, renders a bare `—`, or throws to console in any of the three
states.

### R5 — A first-run user reaches the primary answer on each screen with no instruction ⚙
**Bar:** for each screen, the primary answer is named in advance in `docs/first-run.md` (e.g.
Reconciliation → "does NAV tie, and by how much"), and is **visible on load at 1600×1000 without
scrolling and without any click**. For Diagnose, an entity must be pre-selected so the lenses are
never empty on arrival.
**Evidence:** above-the-fold screenshot per screen at 1600×1000 with the primary answer boxed;
DOM assertion that the element is in the viewport on load.
**Fails if:** the answer needs a scroll, a click, a search, or a tab switch.

### R6 — Keyboard focus is visible on every interactive element, and every control is reachable ⚙
**Bar:** (a) zero `outline:none` without a replacement `:focus-visible` style of ≥ 2px contrast
≥ 3:1 — the original has 3 bare `outline:none` against 5 `:focus-visible` rules; (b) a tab-order
walk of every screen reaches every control, with no trap and no focus lost to a hidden element;
(c) every click target that is not a native control has a role, a name, and a keyboard activation
path — this explicitly includes the sortable table headers, the accordion headers, the graph
nodes, the ribbon segments, and the flag chips, all of which are `div`/`th` click targets in the
original; (d) drawers trap focus while open, restore it on close, and close on Esc.
**Evidence:** Playwright keyboard walk logging the focused element at every Tab stop per screen,
committed as `docs/evidence/tab-order/*.json`; a CSS scan for `outline:none`; contrast computation
on the focus ring.
**Fails if:** any control is mouse-only, or focus is ever invisible.

### R7 — The glossary is reachable from every screen in one action ⚙
**Bar:** one action — a single click or a single documented keypress — from every screen, every
lens, and with a drawer already open. It opens as an overlay that does **not** discard the current
screen state or selected entity. All 35 terms present. Clicking a glossary-linked label anywhere
opens the glossary *at that term*.
**Evidence:** test that from each screen, one action opens the glossary, asserts term count = 35,
closes it, and asserts the prior selection survived; plus a deep-link test from a label to its term.
**Fails if:** it is a tab, needs two actions from anywhere, or loses state.

### R8 — Every defect found in the original is resolved or carried with a reason ⚙
*Restated, and why:* the brief specified "each of the 12 TODO/FIXME/HACK markers". There are none.
A case-insensitive scan for `todo|fixme|hack|xxx|bug|kludge|workaround|temporary` returns 12 hits,
all on line 880, all the substring `XXX` inside the entity code `CAXXXII` ("AP CA XXXII Holdings,
L.P."). The criterion is therefore graded against the real defect inventory in
`redesign-spec.md` §1.8 and §1.1–1.7, which is what it was reaching for. The original wording is
preserved above so the substitution is auditable.

**Bar:** `docs/issues.md` lists every defect from the spec's inventory — the dead code (`PF`, `Q`,
`vchip`, `ragc`, `recActive`), the dead data (`EMB.recon`, `dcN`, `resid`, `apexPos`, `grandVar`,
7 `PRICING` fields, 5 `REC` fields, `UNI.counts`, 2 × `maxlevel`), the 2 dead DOM ids
(`lth-live-s`, `lth-dp-s`), the duplicated `REC`/`REVISE` engines, the 2 fullscreen
implementations, the 4 copies of the $250k/50bps threshold, the 5 identifier collisions, the 61
`!important`, the 3 `outline:none`, the 10 swallowed exceptions, the 2 remote CDN dependencies,
and the $2,785.79 dual product NAV — each marked **resolved** (with the commit or file:line) or
**carried** (with a reason and an owner). Zero items unaccounted for.
**Evidence:** `docs/issues.md` cross-checked against the spec inventory by a script that fails if
any inventoried item is missing.
**Fails if:** an item is silently dropped, or "carried" with no reason.

---

## Added criteria — from what I found in the original

### R9 — One definition of every business rule ⚙
**Bar:** the materiality threshold (`|gap| ≥ $250,000` **and** `|bps| ≥ 50`) exists in exactly one
place — the original has four independent copies in `ltFlag`, `ltFundFlags`, `renderScore`,
`rfxFlag`. Same for the warn/bad bps bands (25/50) and the top-N truncations (8, 10, 14, 40, 200).
**Evidence:** grep for each literal across `src/`, expected count 1, in `tests/unit/rules.spec.ts`.
**Fails if:** any threshold literal appears more than once outside its single definition.

### R10 — No two different quantities share a user-visible label ⚙
**Bar:** the original calls two different quantities "Repriced MV" (Derived-in-After-mode, and
Revised MV), and uses "Applied" for both a price and an ownership share. Every user-visible label
maps to exactly one domain quantity, across both pricing views.
**Evidence:** a label→quantity table in `docs/labels.md`, machine-checked for uniqueness in both
Before and After views.
**Fails if:** any label resolves to two quantities, in either view.

### R11 — Every figure states its basis ⚙
**Bar:** any value that differs between pricing views, or between fund-entity and Σ-feeder bases,
is rendered with its basis adjacent — "at current marks", "NAV-repriced", "fund-entity basis",
"Σ top-level feeders". This is the criterion that catches the $2,785.79 dual product NAV: both
figures must survive unchanged **and** be distinguishable on sight.
**Evidence:** DOM assertion on both product-NAV renderings and on every view-sensitive column
header, in both views.
**Fails if:** two figures for the same-sounding concept are shown with no basis stated.

### R12 — The pricing view is never ambiguous and never offered where it is meaningless ⚙
**Bar:** the active view (Before / After) is visible on every screen where any figure depends on
it, and the control is hidden on screens where it changes nothing (the original correctly hides it
on `str`/`iss`/`gls`). Switching views never leaves a stale figure on screen.
**Evidence:** per-screen assertion of control visibility and of the view indicator; a
toggle-and-recheck test asserting every view-sensitive figure changed or was relabelled.
**Fails if:** a screen shows view-sensitive figures with no visible view state, or the control
appears where it does nothing.

### R13 — Exports produce a file, and the file agrees with the screen ⚙
**Bar:** all four exports (Reconciliation CSV, Look-through Excel, Pricing Excel, send-to-pricing
CSV) download a non-empty file, **and** at least three spot figures per export tie exactly to the
figures rendered on screen at the moment of export, including in After-pricing view.
**Evidence:** Playwright download assertions plus parsed-file comparisons in
`tests/e2e/exports.spec.ts`.
**Fails if:** a file is empty, fails to download, or disagrees with the screen by any amount.

### R14 — Nothing fails silently ⚙
**Bar:** zero `console.error`, zero unhandled rejections, and zero empty `catch` blocks in `src/`.
The original swallows exceptions in 10 places behind `console.warn` and several bare `catch(_e){}`,
so a broken panel looks like an empty panel. Every caught error must surface in the UI as R4's
error state or be re-thrown.
**Evidence:** console listener assertion across the whole e2e run; a lint rule banning empty catch.
**Fails if:** any console error, or any catch that neither surfaces nor rethrows.

### R15 — The app runs with the network disabled ⚙
**Bar:** with `context.route('**', route => route.abort())` for every non-`file://`/non-localhost
request — or an offline browser context — all three screens, all four lenses, both drawers and all
four exports work. `xlsx` 0.18.5 and `d3` 7.8.5 are served from `vendor/`.
**Evidence:** an offline Playwright project in CI whose run log shows zero outbound requests.
**Fails if:** any feature degrades, or any request is attempted.

### R16 — Selection survives navigation ⚙
**Bar:** the Diagnose entity selection persists across all four lenses, across a drawer opening
and closing, and across a pricing-view toggle. Screen-level state (expanded tree rows, sort
column, filter text) survives leaving and returning to the screen.
**Evidence:** a state-persistence test per pair of lenses and per drawer.
**Fails if:** any lens resets the selection, which is the exact defect that made the original cost
four searches for one entity code.

### R17 — Numeric precision is consistent and documented ⚙
**Bar:** one documented rule per quantity class, applied everywhere: money 0dp with thousands
separators, negatives in parentheses in tables and `-$` in prose (the original's own convention —
`Uv` vs `U`); unit prices 6dp; bps 1dp; percentages 2dp; unit counts 0dp. Documented in
`docs/labels.md`.
**Evidence:** a formatter unit-test matrix, plus a rendered-text scan asserting the decimal count
per column.
**Fails if:** the same quantity class is rendered at two precisions in two places.

### R18 — Empty and zero results have a recovery path ⚙
**Bar:** every combobox with no matches, every filter with no rows, and every lens for an entity
with no data states what happened in plain language and offers the next action (clear the filter,
widen the scope, pick another entity). The original's "no matches" is a non-actionable dead end
and its `None 🎉` bucket state offers nothing.
**Evidence:** screenshots and DOM assertions per empty state.
**Fails if:** any empty state is a dead end.

---

## Scoring template

Regenerate `docs/ux-scorecard.md` each critic pass:

| # | Criterion | Score | Evidence cited |
|---|---|---|---|
| R1 | Screen states its question | | |
| … | | | |

**Gate result:** PASS only if all 18 are PASS with cited evidence.
