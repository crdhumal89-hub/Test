# TRACE-Pro — UX scorecard, second independent pass

**Grader.** An independent reviewer. I did not design, build or fix any part of this application, and
I did not read the first pass's `docs/ux-scorecard.md`, `docs/ledger.md` conclusions, or any fix-round
report before measuring. I read `docs/ux-rubric.md` first and graded against its words.

**What I graded.** Commit `c354df9` ("R3 + R5 + R6 + R12, and two defects the fixes themselves
exposed"), the tip of the working tree, clean. Bundle built from source at grading time:
`npm run build` → `dist/assets/index-j4W1Pn_j.js` 190.75 kB, `index-CGZZxfB7.css` 25.17 kB.

**Method.**

1. `npm run build`, then `npx vite preview --port 5391 --strictPort`. I never graded against a
   pre-existing `dist/`; every measurement below was taken after a build in this session.
2. Chromium from `/opt/pw-browsers` via `@playwright/test`, viewport 1600×1000, locale `en-US`,
   timezone `UTC`, `reducedMotion: reduce`, readiness gated on
   `await page.waitForFunction(() => !document.documentElement.dataset.fetching)`.
3. My probes are in `docs/evidence/critic2-scripts/` (19 scripts) and my measurements in
   `docs/evidence/critic2-*.json` plus ~100 screenshots. Every number in this file is reproducible
   by running those scripts against a fresh build.
4. I also ran the shipped gates, so I know what the project's own machinery says:
   - `npx vitest run` → **114 passed** (6 files).
   - `npx playwright test` → **64 passed** (app + offline projects), 2.1 min.
   - `npm run lint` (eslint + `check-frozen` + `check-limits` + `check-issues` + `extract-fixtures
     --check` + `classify-keys`) → pass; parity gate `RESULT: PASS — 728 figures / 14 empty /
     278 text; 41 declared-label keys, all 41 digit-guarded`.
5. **I did not treat any of that as evidence that a criterion passes.** For each criterion I read
   what the shipped test asserts, compared it to what the rubric demands, and where the test was
   weaker I measured the criterion's own bar myself. Section 5 is that comparison. Where a doc,
   commit message or code comment made a claim, I checked it against source and git history
   (section 6).

**A note on my own reliability.** Two of my first measurements were wrong and I corrected them
rather than reporting them. (a) A hash-only `page.goto` is a same-document navigation and preserves
scroll, which made R5 look broken on Pricing and Structure; I re-ran with a genuine load per route.
(b) My tab-order walk stopped at the first `BODY` stop, which made `#open-glossary` look unreachable;
the app focuses `#screen` on load, so a walk must be allowed one wrap. Both corrections are in the
scripts. I mention them because the same two artefacts could make a grader over-report.

---

## Result

| | Count |
|---|---|
| **PASS** | **15** |
| **FAIL** | **3** — R2, R4, R17 |

**Gate verdict: FAIL.** The rubric's own rule (`docs/ux-rubric.md:220`) is "PASS only if all 18 are
PASS with cited evidence."

This is a much better application than a 3-fail count suggests. Twelve of the fifteen passes are
passes I had to work to break and could not: R6's focus behaviour, R13's export tie-outs, R15's
offline behaviour and R16's state persistence are stronger than their own tests claim. The three
failures are concentrated: one is a vocabulary gap on three Diagnose lenses, one is a set of panels
that were enumerated in the criterion and never given states, and one is a precision rule that the
frozen parity baseline makes unachievable as written.

---

## R1 — Every screen states, in one line at the top, the question it answers

**PASS.**

My measurement (`docs/evidence/critic2-r1-r2.json`, `critic2-scripts/r1-r2.mjs`): all seven question
elements render, exactly one per screen and one per lens, every one ends in `?`, every one ≤ 140
characters:

| Element | Chars | Painted top | Ends in `?` |
|---|---|---|---|
| `#reconciliation-question` | 91 | y=182 | yes |
| `#pricing-question` | 86 | y=182 | yes |
| `#diagnose-question` | 103 | y=144 | yes |
| `#structure-question` | 70 | y=321 | yes |
| `#ownership-question` | 58 | y=321 | yes |
| `#data-quality-question` | 67 | y=321 | yes |
| `#simulator-question` | 91 | y=359 | yes |

"First text in its content region" measured geometrically, not by DOM order: I sorted every element
in `#lens-body` that carries its own text by `getBoundingClientRect().top` and the first item is the
lens question on all four lenses (`critic2-r1-r2.json` → `routes.*.r1.lensFirst`). For the three
top-level screens the same measurement over `#screen` is in `tests/e2e/rubric-order.spec.ts`, which
I ran and which passes; I did not need to duplicate it. None of the seven restates its screen title
and none is filler.

## R2 — No user-visible bare abbreviation survives outside the glossary

**FAIL.**

I crawled the rendered text of every screen, lens and drawer against the rubric's **own 26 tokens**
(`docs/ux-rubric.md:41-44`), scoring each occurrence as pass only if (a) an expansion appears at or
before its first use on that screen, or (b) it is inside a `.gterm` glossary link
(`critic2-scripts/r1-r2.mjs`; results `docs/evidence/critic2-r1-r2.json`).

**Nine bare occurrences across four screens.** Screenshots:
`docs/evidence/critic2-r2-ownership-lens.png`, `critic2-r2-data-quality.png`,
`critic2-r2-simulator.png`, `critic2-r2-masthead.png`.

| Screen | Token | The exact rendered string | Expanded first? | Glossary-linked? |
|---|---|---|---|---|
| all six | `NAV` | `NAV pricing and look-through` (masthead `.tagline`, y=20) | no | no |
| Ownership | `qty` | `Total qty: 1,330,020,204` (`.own-qty`, y=406) | no | no |
| Ownership | `SPV` | `SPV / FUND` (`.tag-vehicle`), `SPV fund code` (`.th-label`) | no | no |
| Ownership | `VPM` | `VPM symbol` (`#ownership-tree` header, y=511) | no | no |
| Data quality | `SPV` | `Missing / dangling SPV code` (`.dq-name`, y=699) | no | no |
| Data quality | `VPM` | `Unmapped identifiers (missing VPM symbol / name)` (y=780) | no | no |
| Simulator | `px` | **20** SVG captions, e.g. `px 1.122812` (`#simulator-stage`) | no | no |
| Simulator | `SPV` | `SPORTHLD - SPV · value $1,795,754,765.06 · 1.024650 per unit` (y=443) | no | no |
| Simulator | `bps` | `… = 27,499,577 (153 bps) — SPV/underlyings marked …` | no | no |
| Simulator | `Δ` | `… Σ top-level feeder NAV · the unshocked baseline every Δ below …` | no | no |

**Root cause, measured.** `src/ui/primitives/term.ts:284` provides `termVocabularyLine()`, the
mechanism that satisfies route (a). It is mounted on exactly three screens —
`reconciliation/index.ts:40`, `pricing/index.ts:48`, `structure/index.ts:127`. The Ownership, Data
quality and Simulator lenses render **no vocabulary line at all**
(`critic2-r2-shots.json` → `vocabularyLines`: three empty arrays), and none of their abbreviations is
wrapped in `term()`. The masthead tagline is an independent miss: it is the first `NAV` a reader meets
on *every* screen and it precedes the vocabulary line that expands it.

**Smallest honest fix.** Four edits, no new mechanism: add `termVocabularyLine([...])` to
`ownership/index.ts` (`nav`, `spv`, `vpm`, `global_units_global_quantity`),
`data-quality/index.ts` (`spv`, `vpm`), `simulator/index.ts` (`nav`, `bps`, `spv`, `pricing`,
`publish_px_vs_current_applied_px_vs_revised_px`), and either wrap the masthead tagline's `NAV` in
`term('NAV','nav')` or reword it to "Net asset value pricing and look-through". The 20 SVG `px`
captions need only the Simulator's vocabulary line, because R2's route (a) is per screen.

## R3 — Every displayed figure carries a unit and an as-of date

**PASS.**

I enumerated figures from **rendered text** (every element whose own text is a number), not from
`[data-parity]`, and walked each route top to bottom in viewport steps, requiring the as-of to be
readable at every step where any figure was (`critic2-scripts/r3-r5.mjs`;
`docs/evidence/critic2-r3-asof-units.json`).

- **As-of:** across all six routes and 19 scroll steps, **zero** steps had a figure readable while
  `#asof` was not. `.masthead` computes to `position: sticky`, so the as-of and `2026-06-30` are in
  the viewport at every scroll offset. The Simulator is the tallest route (5 steps) and passes.
- **Units:** after resolving each figure against its own text, its column header, its table caption
  and its `dt`/label, the residue was 11 elements across three routes, and I read every one. All 11
  resolve: `Units outstanding (firm-wide) 1,752,553,740` and `Price per unit 1.024650` take the unit
  from their `<dt>`; `High severity 31 / Medium 52 / Low 22 / Total issues 105` are issue counts whose
  card label names what is counted; the three exception chips (`5 Missing NAV`, `1 Dangling SPV`,
  `8 Material non-position gap`) are fund counts whose `aria-label` reads "Jump to the first **fund**
  flagged …". Weakest point in the criterion: the chips render the bare digit with no noun beside it.

Cosmetic discrepancy: the rubric names `docs/evidence/units.json`; the suite writes
`docs/evidence/units-and-asof.json`. Content, not the filename, is what I graded.

## R4 — Every data-dependent panel has a defined loading, empty, and error state

**FAIL.**

The criterion enumerates ten panels. I tried to reach all three states on each
(`critic2-scripts/r4.mjs`, `r4b-r14.mjs`, `r4c-simulator.mjs`; results `critic2-r4.json`,
`critic2-r4b-r14-fixture-failures.json`, `critic2-r4c-simulator-error.json` — 80 induced-failure
scenarios plus 12 lens scenarios).

| Panel | Loading | Empty | Error |
|---|---|---|---|
| reconciliation tree | yes | yes | yes |
| price table | yes | yes | yes |
| repricing walk | yes | yes | yes |
| Ownership lens | yes | yes | yes |
| Data quality lens | yes | yes (see R18) | yes |
| Structure lens | **no** | **no** | yes (`#structure-graph-error`) |
| Simulator lens | **no** | yes | **no** |
| the two upload slots | **no** | **no** | **no** |
| every combobox result list | **no** | yes (text only) | **no** |
| lazily-fetched universe | yes | n/a | yes |

Three findings, in order of seriousness.

**(a) The two upload slots have no states, and their recovery action does not exist.**
`docs/evidence/critic2-r4-upload-slots.png`. The Data sources drawer renders two
`.sources-slot` elements, each with `controls: 0` and `states: 0`, each stamped
**"Accepted on the Reconciliation screen"**, under this sentence
(`src/ui/drawers/sources.ts:250-258`):

> "the recompute is wired on the Reconciliation screen — upload there and the reconciliation, the
> tree and every price update in place, in front of you."

I clicked `#sources-upload-link` and measured the Reconciliation screen it lands on
(`critic2-misc.json` → `r18.afterFollowingUploadLink`):
`{ hash: "#/reconciliation", fileInputsAnywhere: 0, dropTargets: 0, anythingSayingUpload: [] }`.
A repository-wide grep confirms it: there is no `input[type=file]`, no `FileReader` and no drop
handler anywhere under `src/`. **The one real control in the panel is a dead end and the sentence
above it is false.**

**(b) The Structure lens has no loading and no empty state.** `loadingState` and `emptyState` are
imported by `ownership/index.ts` and `data-quality/index.ts` and by neither `structure/index.ts` nor
`simulator/index.ts`. At runtime, holding `universe.json` open for 7 s and mounting
`#/diagnose/structure` produces no `.state-loading` anywhere (`critic2-r4.json` →
`lensLoading.structure.loading: []`), and scoping to an entity produces no `.state-empty`.

**(c) The Simulator lens has no panel-scoped error state, and one malformed fixture takes the whole
app down with a raw stack message.** Serving `simulator.json` with `apex` as a string —
the same malformed-fixture technique `tests/e2e/states.spec.ts` uses for the tree — gives
(`critic2-r4c-simulator-error.json`, screenshot
`critic2-r4c-apex-not-an-array_diagnose_simulator.png`):

```
screenText:  ""            (the whole #screen is empty; the masthead is gone too)
bodyText:    "TRACE-Pro could not start. TypeError: e.apex.reduce is not a function  Try again"
pageerror:   TypeError: e.apex.reduce is not a function
```

There *is* a whole-app error boundary with a "Try again" button, so this is not silent — but R4
requires **a plain-language sentence** and this shows the operator a minified `TypeError`. The same
shape occurs for `simulator.json` with `edges` deleted (`e.edges is not iterable`), `repricing.json`
as `{}` (`Cannot read properties of undefined (reading 'length')`) and `manifest.json` as `{}`
(`… reading 'product'`). By contrast the guarded path is exemplary: aborting `universe.json` renders
a proper `role="alert"` panel reading *"The firm-wide ownership universe could not be loaded. Could
not reach data/…/universe.json. Check that the data folder shipped with the app. … Try again"*
(`critic2-r4-universe-aborted.png`).

**Smallest honest fix.** (a) Delete the false sentence and the slot state, and either ship a real
`input[type=file]` on Reconciliation or say plainly that upload is not in this rebuild — then the
slots are description, not panels, and drop out of R4's list; this is a three-line edit to
`src/ui/drawers/sources.ts`. (b) Give `structure/index.ts` the same
`if (pricingFixturesInFlight()) return loadingState(...)` guard the price table already has.
(c) Wrap the Simulator's fixture read in the shape `data/load.ts:69` already uses, so a malformed
`simulator.json` produces a `FixtureError` with a sentence instead of a `TypeError`, and scope it to
the lens rather than the boot.

## R5 — A first-run user reaches the primary answer on each screen with no instruction

**PASS.**

I re-derived the contract from `docs/first-run.md` rather than from the test, **including the two
rows the shipped `FIRST_RUN` table omits** (`#ownership-question` and `#simulator-question`, which
§3's fourth row names for every lens). Each route was given a genuine load in a fresh page — a
hash-only navigation preserves scroll and would corrupt the measurement.

Result (`critic2-scripts/r3-r5.mjs`; `docs/evidence/critic2-r5-above-fold.json`; screenshots
`critic2-fold-*.png`, six of them): **every row of every route above the fold, `window.scrollY === 0`
on all six, zero clicks, zero keypresses.** 41 contract rows plus 4 shared-chrome rows plus 4
Diagnose-shell rows. The two rows the test omits both pass on my measurement:
`#ownership-question` at y=321…347 and `#simulator-question` at y=359…385.

Diagnose arrives with an entity pre-selected (`#diagnose-entity` = `APPOUR1-SPV`) and the Simulator's
fallback subject renders (`#simulator-baseline` `$2,062,198,835.86`, `#simulator-subject`
`SPORTHLD - SPV · value $1,795,754,765.06 · 1.024650 per unit`) — no lens is a blank frame.

## R6 — Keyboard focus is visible on every interactive element, and every control is reachable

**PASS.** This is the criterion I tried hardest to break.

**(a) `outline:none`.** Live stylesheet scan of the built CSS: `bareOutlineNone: []`, against 3
`:focus-visible` rules (`:focus-visible`, `.screen:focus-visible`, `.own-seg:focus-visible`)
(`critic2-r6.json` → `css`).

**(b) Reachability — the clause the shipped test does not check.** The shipped walk enumerates the
stops it happens to find; it never compares them to a census of controls, so a mouse-only control is
invisible to it. I tagged every visible focusable candidate with a unique attribute and tracked which
ones received focus (`critic2-scripts/r6b.mjs`; `critic2-r6b-reachability.json`):

| Route | Candidates | Reached | Missing |
|---|---|---|---|
| reconciliation | 38 | 38 | 0 |
| pricing | 72 | 72 | 0 |
| diagnose-structure | 30 | 30 | 0 |
| diagnose-ownership | 107 | 107 | 0 |
| diagnose-data-quality | 14 | 14 | 0 |
| diagnose-simulator | 54 | 53 | 1 — `⏸ Pause`, and it is `disabled: true` before a run starts |

No trap, no focus lost to a `[hidden]` subtree, no unnamed stop (three shock inputs have no
`aria-label` but each has a real `<label for>`, `shock-panel.ts:136`).

**(c) The five named non-native target classes.** Every one has a role, a name and Enter activation
that changed the screen (`critic2-r6.json` → `namedTargets`):

| Target | Count | Role | Focusable | Enter changed the screen |
|---|---|---|---|---|
| price-table headers | 9 | `columnheader` | yes | yes |
| walk headers | 12 | `columnheader` | yes | yes |
| data-quality accordion headers | 10 | (native `button`) | yes | yes |
| structure graph nodes | 46 | `button` | roving | yes |
| ownership ribbon segments | 39 | `button` | yes | yes |
| flag chips | 3 | `button` | yes | yes |

The graph nodes use a roving tabindex (`structure/graph.ts:321`, one `tabindex=0` and 45 at `-1`),
which looks like 45 unreachable controls until you test the rove. I did: focusing the first node and
pressing ArrowRight reaches **46 of 46** distinct nodes (`critic2-scripts/`, verified per element by
a unique `data-rid`), and the Simulator's graph reaches 27 of 27. The reconciliation tree headers
have no role and no tabindex — correctly, because they are not click targets: `cursor: auto`,
`role: null`, `aria-sort: null`, and a synthetic click changes nothing.

**(d) Drawers.** For both `#open-glossary` and `#open-sources`: focus moves inside on open; 60
consecutive Tabs produced **zero** escapes from `#drawer-host`; Escape closes; focus is restored to
the exact opener (`open-glossary`, `open-sources`) (`critic2-r6.json` → `drawers`). The row-detail
drawer restores focus to its own `data-node-id` row.

**(e) Ring quality.** Across all six routes: zero zero-area stops, zero rings under 2 px, zero rings
under 3:1 against the colour they are painted over, zero untyped `div`/`span`/`td`/`tr`/`th` stops.

## R7 — The glossary is reachable from every screen in one action

**PASS, with a real defect the criterion's wording lets through.**

From all six routes: one click on `#open-glossary` opens a `role="dialog" aria-modal="true"` overlay
with **exactly 35 `.glscard` terms**; Escape closes it; the screen question and the selected entity
are byte-identical before and after; the `G` key also works from all six
(`critic2-misc.json` → `r7`).

**The clause the shipped test never exercises: "with a drawer already open."** I did
(`critic2-scripts/r7b.mjs`; `critic2-r7b.json`; screenshots `critic2-r7b-*.png`):

| With this open | `elementFromPoint` at the Glossary button's centre | Click | `G` |
|---|---|---|---|
| nothing | the button itself | 35 cards | 35 cards |
| `#reconciliation-detail` | `<div><span class="drawer-symbol">ASCHON-SPV</span>…` | **fails, 0 cards** | 35 cards |
| `#pricing-detail` | `<span class="badge badge-ok">Top-level feeder</span>` | **fails, 0 cards** | 35 cards |
| `#sources-drawer` | `<header class="drawer-head"><h2 …>Data sources & as-of</h2>…` | **fails, 0 cards** | 35 cards |

So with any drawer open the masthead button is physically occluded by the drawer and cannot be
clicked. The rubric's bar is "a single click **or** a single documented keypress", the `G` key is
documented (`#open-glossary`'s own `title` ends "(G)"; `docs/first-run.md` §4), it delivers all 35
terms, and the underlying drawer survives — so the bar is met and the fail conditions ("it is a tab,
needs two actions from anywhere, or loses state") are not triggered. I grade PASS on the words. **A
visible button that does nothing is worse than a hidden one**, and I would fix it: give the drawers a
`z-index` below `.masthead`, or inset them below the masthead's height.

Deep-link clause (R7's fourth sentence): clicking a `.gterm` opens the glossary; I could not confirm
it lands *at that term* — see section 6.

## R8 — Every defect found in the original is resolved or carried with a reason

**PASS.**

`node scripts/check-issues.mjs` → `inventory: 33 items, 33 present · dispositions: 11 rows, 7
carried, 0 undisposed · stale claims: 0 · ISSUE REGISTER CHECK PASSED`, exit 0. I read the script
before trusting it: `INVENTORY` (`scripts/check-issues.mjs:30-47`) is a hard-coded token list
independent of `docs/issues.md`, so the check is not circular, and `STALE_CLAIMS` actively probes the
repository (e.g. it fails if a disposition says a lens is "not built" while all five lens files
exist). I then grepped `docs/issues.md` myself for each of the rubric's named items — `PF`, `vchip`,
`ragc`, `recActive`, `EMB.recon`, `dcN`, `resid`, `apexPos`, `grandVar`, `UNI.counts`, `maxlevel`,
`lth-live-s`, `lth-dp-s`, `REVISE`, fullscreen, `250`, collisions, `!important`, `outline:none`,
swallowed exceptions, CDN, `2,785.79` — all present, all dispositioned, 27 owner references.

One hole worth naming, though it does not trip R8's fail conditions: the stale-claim detector reads
only `docs/issues.md`, and §O11 of that file still asserts a live gap that is fixed in code — see
section 6.

## R9 — One definition of every business rule

**PASS.**

My own greps of `src/`, independent of `tests/unit/rules.spec.ts`:
- `250_000` / `250000` / `250,000`: three hits. One is the rule
  (`src/domain/exceptions.ts:12 export const MATERIAL_USD = 250_000`); the other two are a glossary
  search alias and its prose (`src/glossary/terms-nav.ts:119-120`).
- `MATERIAL_BPS = 50`, `WARN_BPS = 25`, `BAD_BPS = 50` each declared once
  (`exceptions.ts:13,16,17`) and referenced by name; the single `>= 50` outside that file is
  `structure/layout.ts:89`, a pixel offset (`50 + depth * …`).
- Every raw `.slice(0, n)` left in `src/` is a string-length cap (197, 40, 28, 27, 24, 14, 10) except
  three row limits — `ledger.ts:212 slice(0, 6)`, `ultimate-owners.ts:61 slice(0, 5)`,
  `ultimate-owners.ts:181 slice(0, 3)`. None of 3, 5 or 6 is one of the rubric's named truncations
  (8, 10, 14, 40, 200), each of which lives once in `TRUNCATE` and is read by name. Residue noted,
  not a failure.

## R10 — No two different quantities share a user-visible label

**PASS.**

There is **no machine check of `docs/labels.md` anywhere** in `scripts/` or `tests/` (grep for
`labels.md` in both returns nothing), so R10's named evidence does not exist and I measured it
myself (`critic2-scripts/r10.mjs`; `critic2-r10.json`). I harvested every label-bearing element
(`th`, `.th-label`, `.wf-label`, `.tile-label`, `.kpi-label`, `.chip-label`, `dt`, `label`,
`.sim-tile-label`, `.dq-card-label`) on all six routes **in both bases**, with the repricing walk
opened so its 12 headers are in scope.

- **Zero duplicate labels in either basis.** (The `×2` entries in the raw JSON are my own selectors
  double-counting a `th` and its inner `.th-label` span — same element, same words.)
- **Both collisions the rubric names are gone from the UI.** `Applied px`, `Applied %`,
  `Repriced MV`, `Derived MV`, `Revised MV`, `Publish px`, `Current px`, `Revised px`,
  `Immediate %`, `Carried MV`, `Position MV`, `in tol` — none appears in the rendered text of any
  screen in either basis. (`Applied px` and `Repriced MV` do appear in the frozen
  `tests/baseline.json`, which pins the *original's* strings; `docs/rename-map.json` declares the
  replacement and `npm run gate:parity --expect-renamed` enforces it.)
- Every basis-sensitive label changes with the basis rather than staying put over moved figures —
  see R11.

One label is rendered against `docs/labels.md`'s own prescription: see section 6.

## R11 — Every figure states its basis

**PASS.**

`critic2-scripts/r11.mjs`; `critic2-r11.json`.

**The $2,785.79 dual product NAV: both figures survive unchanged and are distinguishable on sight.**

- `$2,062,198,835.86`, labelled *"United States dollars · Σ top-level feeder NAV · the unshocked
  baseline every Δ below is measured against"* (`#simulator-baseline`), and `$2,062,198,836` in the
  waterfall with `.wf-basis` *"sum of top-level feeder NAVs · as of 2026-06-30"*.
- `$2,062,196,050.07`, labelled *"Product NAV … · fund-entity basis — One entity stamp, not the sum
  of the top-level feeders"* (`#structure-readout`).
- `#structure-basis`, visible below the stage on load, names both and the difference in prose: *"Two
  product net asset values (NAV) exist and both are right, so neither is labelled just 'Product NAV'
  … They differ by $2,785.79, which is the whole NAV of the DUNK feeder: a basis difference, not a
  break."*

**Every view-sensitive column header changes with the basis.** Measured in both:
`pricing.priceHeaders`, `pricing.viewNote`, `recon.treeHeaders`, `recon.waterfall`, `recon.viewNote`
all differ between bases; `Look-through value` → `Look-through value at repriced marks` in both the
price table and the tree; the walk's 12 headers are correctly identical in both bases because the
walk shows before and after side by side and depends on neither.

## R12 — The pricing view is never ambiguous and never offered where it is meaningless

**PASS.**

I set the basis on Pricing, entered each route by hash without a reload, and compared `#screen`'s
`textContent` between bases (`critic2-misc.json` → `r12`):

| Route | Control visible | `#view-note` visible | Flipping the basis changed the screen |
|---|---|---|---|
| reconciliation | yes | yes | yes |
| pricing | yes | yes | yes |
| diagnose-structure | no (height 0) | no (height 0) | no |
| diagnose-ownership | no (height 0) | no (height 0) | no |
| diagnose-data-quality | no (height 0) | no (height 0) | no |
| diagnose-simulator | yes | yes | yes |

Control visibility equals basis-dependence on all six, in both directions — the control is offered
exactly where a figure moves with it and nowhere else, and where it is hidden it occupies zero
pixels rather than leaving a band. `#view-note` names the active basis in words.

## R13 — Exports produce a file, and the file agrees with the screen

**PASS.**

I downloaded all four exports in both bases, parsed the bytes back (RFC-4180 CSV reader; SheetJS
0.18.5 for the workbooks) and compared against the strings the app rendered
(`critic2-scripts/r13b.mjs`, `r13-r15.mjs`; `critic2-r13b.json`, `critic2-r13-r15.json`):

| Export | File | Bytes | Spot figures tied |
|---|---|---|---|
| Look-through CSV, current marks | `TRACE-Pro_lookthrough_…_current-marks_2026-06-30.csv` | 22,515 | 3/3 |
| Look-through CSV, repriced | `…_repriced_2026-06-30.csv` | 22,439 | 3/3 |
| Reconciliation workbook × 2 bases | `TRACE-Pro_Reconciliation_SPORT_….xlsx` | 35,551 / 35,595 | 4/4 each |
| Pricing workbook × 2 bases | `TRACE-Pro_Pricing_SPORT_….xlsx` | 34,509 / 34,489 | 3/3 each |
| Send-to-pricing CSV × 2 bases | `TRACE-Pro Pricing Export (SPORT) 2026-06-30.csv` | 995 | 9/9 each |

Every tie exact, in both bases, including the repriced basis where the pricing difference must read
`$0`. The look-through CSV differs between bases (22,515 vs 22,439 bytes) and names its basis in row
1; the send-to-pricing CSV is byte-identical in both, which is correct — a fund's publishable unit
price is its own NAV ÷ units regardless of the basis on screen — and I asserted that rather than
assumed it.

### Disputed finding 1 — adjudicated: the send-to-pricing CSV carries no figure the operator cannot see

`src/export/csv.ts:171` writes four columns. My measurement
(`critic2-r13-r15.json` → `r13.sendToPricing-before.ties` and `.walkHeaders`):

| Column | Ties to | Screen string | Visible at the moment of export |
|---|---|---|---|
| `Symbol` | price table's Symbol | `ASCHON-SPV` | yes |
| `Local Price` | `pricing.fund.<code>.publish_px` | `1.024650` | yes |
| `Respective Qty` | `pricing.walk.fund.<code>.global_qty` | `260,031,426` | **no** — inside `#pricing-walk-table[hidden]` |
| `Local MV` | `pricing.walk.fund.<code>.nav` | `$266,441,285` | **no** — same |

**The second party is right.** The walk's rendered header row is
`["Level ▾","Fund","Symbol","Global Qty","NAV","Price before","Value before","Price after","Value
after","Δ Price","Δ Value (P&L)","Δ bps"]`, so `Respective Qty` → **Global Qty** and `Local MV` →
**NAV** are real, on-screen columns of the Repricing walk, and after one click on the "Repricing
walk" subview segment they render the identical strings (`260,031,426`, `$266,441,285`). The claim
that they "appear nowhere on screen" is false.

**The caveat the second party understates.** At the moment of export the walk is `hidden`, so those
two figures are in the DOM and not painted. Two of the four columns therefore need one extra click on
a named subview control on the same screen. R13's own minimum — "at least three spot figures per
export" — is met by `Local Price` across three funds without any click, so the criterion passes. The
same is true of the Pricing workbook: the shipped test ties it via walk keys that are hidden, but the
identical figures render in the visible price table (`pricing.fund.ASCHON.derived_mv`
`$291,966,468`, `.revised_mv` `$292,016,326`).

Two further exports ship with no tie-out test at all — `#export-pricing-csv` (26 rows, 4,225 bytes)
and the data-quality register (105 rows, 13,497 bytes). Both produce well-formed files. Neither is
one of R13's four, so neither affects the score.

## R14 — Nothing fails silently

**PASS.**

- **Healthy path:** my own console/pageerror listener across all six routes recorded **zero**
  problems (`docs/evidence/critic2-console.json` = `[]`), as did every one of my other probes on the
  healthy path, and the shipped `expectClean` assertions across 64 Playwright tests.
- **Empty catch blocks:** zero. A regex for `catch(...){}` over `src/` returns nothing; there are
  nine `catch` sites and I read all nine. Two convert to a `FixtureError` with a plain sentence
  (`src/data/load.ts:69`, `:77`); one surfaces the error outside the SVG with a recovery action *and*
  records it *and* re-throws (`structure/graph.ts:288`).
- **Induced failures:** every `pageerror` I could provoke was a deliberate re-throw of an error that
  had already been surfaced in the UI, which is exactly what R14's "or be re-thrown" permits. The
  only `console.error` I saw was Chromium's own `Failed to load resource: net::ERR_FAILED` when I
  aborted a fetch — browser logging, not app code.

The quality of the induced-error *messages* is an R4 problem, not an R14 one, and is scored there.

## R15 — The app runs with the network disabled

**PASS, and I went past the shipped test.**

`tests/e2e/offline.spec.ts` walks the six routes and the glossary. R15 also names "both drawers and
all four exports", so I ran those too, with every non-origin request aborted and recorded
(`critic2-scripts/r13-r15.mjs`; `critic2-r13-r15.json` → `r15`):

- **`blockedRequests: 0`** — the app attempted no off-origin request at all across six routes, both
  drawers and four exports.
- **`consoleProblems: 0`.**
- Both drawers work: `#open-glossary` → `glossary-drawer` with 35 cards; `#open-sources` →
  `sources-drawer`.
- All four exports produced real files offline, and the two workbooks parse with SheetJS from
  `vendor/`: `TRACE-Pro Pricing Export (SPORT) 2026-06-30.csv` 995 B;
  `TRACE-Pro_Pricing_SPORT_2026-06-30.xlsx` 34,509 B, sheets `[Summary, Pricing]`;
  `TRACE-Pro_lookthrough_…csv` 22,515 B; `TRACE-Pro_Reconciliation_SPORT_….xlsx` 35,596 B, sheets
  `[Summary, Reconciliation]`.

## R16 — Selection survives navigation

**PASS, and again past the shipped test.**

`critic2-misc.json` → `r16`. I selected `SPORTHFC` in `#diagnose-entity` (resolved to
`SPORTHFCSPV`) and then:

| After | `#diagnose-entity` |
|---|---|
| Ownership lens | `SPORTHFCSPV` |
| Data quality lens | `SPORTHFCSPV` |
| Simulator lens | `SPORTHFCSPV` |
| Structure lens | `SPORTHFCSPV` |
| glossary opened and closed | `SPORTHFCSPV` |
| **a real basis flip** (`#view-toggle[data-view=after]`, which the shipped test's comment claims and its code never performs) | `SPORTHFCSPV` |

Screen-level state, which no shipped test covers: expanded tree rows survive leaving and returning
(149 → leave to Pricing → return → **149**); the Pricing filter survives (`SPORT` still in the box);
the sort column survives (`th[data-col=navPx]` `aria-sort="descending"` before and after).

## R17 — Numeric precision is consistent and documented

**FAIL.**

R17's named evidence is "a formatter unit-test matrix, plus a rendered-text scan asserting the
decimal count per column". **Neither exists.** No test file exercises `formatUsd`/`formatBps*`/
`formatPrice` as a matrix (only `tests/unit/lookthrough.spec.ts` touches them incidentally), and a
grep for `decimal` / `dp` across `tests/` returns only a contrast helper in
`rubric-focus.spec.ts:35`. So R17 has no shipped evidence, which under the rubric's own rule 2 is
itself a FAIL. I measured it instead.

**The bps class is rendered at two precisions, in two places, on one screen, for one fund**
(`critic2-scripts/r17b.mjs`; `docs/evidence/critic2-r17b-bps.json`):

| Where | Fund ASCHON's repricing gain or loss, in bps |
|---|---|
| Pricing screen → price table, column headed **`bps`** | **`2`** — 0 dp, no sign, no suffix |
| Pricing screen → repricing walk, column headed **`Δ bps`** | **`+1.9`** — 1 dp, signed, no suffix |
| Pricing screen → score strip | `bottom-up repricing gain or loss · +1.9 bps` |
| Pricing screen → bridge chips | `+10 bps`, `+153 bps`, `-958 bps`, `+0 bps` — 0 dp |
| Reconciliation waterfall | `+1.9 bps`, `+7.7 bps` — 1 dp |
| Simulator prose | `27,499,577 (153 bps)` — 0 dp |

Two arrangements of the *same* 26 funds, on the *same* screen, render the *same* quantity as `2` and
as `+1.9`. The rubric fixes bps at 1 dp and its fail condition is verbatim: "the same quantity class
is rendered at two precisions in two places."

A full rendered-text scan of all six routes plus both drawers, the walk subview and the fund-detail
drawer (`critic2-r17-precision.json`) shows the rest of the rules are held: 47 distinct 6-dp unit
prices and zero at any other precision; 54 distinct 2-dp percentages and zero others; zero
money strings at any precision other than 0 dp or 2 dp. (Money at two precisions —
`$2,062,198,836` in the waterfall vs `$2,062,198,835.86` in the Simulator baseline — is the same
quantity at two precisions, but `docs/labels.md` §6 defines "Money" and "Money, to the cent" as two
classes with one rule each, which is a defensible reading of "one documented rule per quantity
class". I do not fail R17 on that. bps has no such defence: `labels.md` §6 calls its 0-dp cases
"inherited", i.e. an exception to a single rule, not a second class.)

**Smallest honest fix, and a criterion-level conflict the fixer must escalate rather than paper
over.** The one-line fix is to render the price table's `bps` column and the bridge chips through
`formatBpsSigned` (1 dp) instead of `formatBpsCompact`. **But `tests/baseline.json` — frozen, and
read-only to me — pins both `+153 bps` and `+1.9 bps`**, verified: a substring search of that file
finds `+153 bps`, `-958 bps`, `+10 bps`, `+1.9 bps` and `+7.7 bps` all present. So R17 as written
cannot be satisfied without breaking the frozen parity gate. Per the rubric's own instruction at
line 7 ("halt and say why — do not amend it and continue"), this is a conflict for an owner to
decide, not for a fixer to resolve by widening a test. I record R17 FAIL and the conflict together.

## R18 — Empty and zero results have a recovery path

**PASS.**

`critic2-misc.json` → `r18`, `critic2-r18b.json`, screenshots `critic2-r18-combobox.png`,
`critic2-r18-data-quality.png`.

- **Combobox, no matches:** *"No entity matches that. Clear the box to see every fund and SPV in
  this product."* Plain language and a named next action. It is text rather than a button, which is
  weaker than the filter states below, but the box is right there and focused — not a dead end. The
  data-quality scope combobox is better still: *"No fund entity matches that. Clear the box to see
  all of them, or pick 'All fund entities' to scan the whole universe."*
- **Filter, no rows:** price table and repricing walk both render *"No fund matches "zzzz". All 26
  funds are still here."* with a working **"Clear the filter"** button.
- **The `None 🎉` bucket state the rubric names by name is genuinely fixed.** Scoping the
  data-quality register to `Fund IV` yields: *"No data-quality issue touches Fund IV. Its 1
  reachable funds are clean across all 5 checks."* with a **"Scan the whole universe instead"**
  button. (Minor copy bug: "Its 1 reachable funds".)
- Panel error states offer **"Reload this product's data"**; the universe error offers
  **"Try again"**.

The sources drawer's dead upload route is a genuine dead end, but it is neither a combobox, a filter
nor a lens, so I score it under R4 rather than double-counting it here.

---

## Tests weaker than their criterion

This is the section that matters. For each criterion: does the shipped assertion actually cover the
rubric's bar? Twelve of eighteen do not, in ways ranging from cosmetic to decisive.

| # | Shipped test | Covers the bar? | The gap, with file:line |
|---|---|---|---|
| R1 | `tests/e2e/rubric.spec.ts:40-57`; `rubric-order.spec.ts:75-114` | **No** | `rubric.spec.ts:45` takes `page.locator('.screen-question, .lens-question').first()`. On the four Diagnose routes `.first()` is the **shell's** `#diagnose-question`; the lens's own question is never asserted on any route. Separately, `.lens-question` matches nothing — every question element uses class `screen-question`, so that half of the selector is dead (the class survives only at `src/ui/styles/components.css:60`). Six of the eight tests in the two files therefore assert the same shell sentence four times. I measured all seven questions myself. |
| R2 | `tests/e2e/rubric.spec.ts:32-38` | **No — the central defect, unfixed** | `CODE_TOKENS` holds 12 tokens and `PHRASE_TOKENS` 14, for 26 total — the same count as the rubric. But **11 of the rubric's 26 are absent**: `MV`, `px`, `qty`, `apex`, `NAV`, `bps`, `SPV`, `VPM`, `Δ`, `FR`, `DC`. They have been replaced by 14 phrases the rubric never lists (`Derived MV`, `Revised MV`, `Publish px`, `Current px`, `Revised px`, `Applied px`, `Δ Pricing`, `Δ Non-position`, `Repricing P&L`, `Immediate %`, `Applied %`, `in tol`, `scen a`, `scen b`). The committed evidence `docs/evidence/abbreviations.json` carries that substituted 26-token list, so the artifact *looks* complete. This is precisely the finding the previous critic recorded — the shortfall is still 11 tokens, now padded back to 26. Worse, the test's own comment at `rubric.spec.ts:24-31` and `src/ui/primitives/term.ts:200-203` argue that certain tokens are excluded *because the test flags a token only when it is an element's entire text* — the code and the test are reasoning about each other rather than about the criterion. Every one of my nine bare findings uses a token the test does not carry. |
| R3 | `tests/e2e/rubric.spec.ts:102-137` | **No** | Two gaps. (i) `line 115` defines a figure as `#screen [data-parity]` — only parity-tagged elements. The criterion says "every numeric figure"; my rendered-text enumeration finds figures with no parity key. (ii) The test asserts **nothing about units at all** — it checks the as-of is visible and that the as-of string matches `/\d{4}-\d{2}-\d{2}/`. Half the criterion is untested. The as-of half is genuinely strong (the scroll walk was a real improvement). I measured units independently. |
| R4 | `tests/e2e/states.spec.ts` (321 lines) | **No — decisively** | Ten panels are enumerated in the criterion. The file covers three fully (tree, price table, walk) plus one error path on the structure graph. **Six have no test:** the Ownership, Data quality and Simulator lenses; the two upload slots; every combobox result list; and the lazily-fetched universe fixture — whose loading state is *used as a device* at `states.spec.ts:79-90` to reach other panels' loading states, but whose own error state is never asserted. Every one of my three R4 findings is in that untested six. |
| R5 | `tests/e2e/rubric.spec.ts:144-253` | **Almost** | Genuinely strong: the `FIRST_RUN` table is row-for-row the contract document, with counts where the doc says "the first five", `rect.top >= 0 && rect.bottom <= innerHeight && h > 0`, and `window.scrollY === 0` per route. One omission: `DIAGNOSE_ROWS` (`lines 206-211`) drops the per-lens question row that `docs/first-run.md` §3's fourth row names for every lens, so `#ownership-question` and `#simulator-question` are asserted nowhere. Both pass on my measurement, so the omission cost nothing here — but it is the same class of drift. |
| R6 | `tests/e2e/rubric-focus.spec.ts` | **No, on two of four clauses** | The ring work (geometry, ≥2 px, ≥3:1 against the painted fill, dual-tone separation, and the screenshot-diff proof that the ring is not clipped away) is the best test in the repository. But clause **(b)** "reaches every control" is never asserted: `measuredWalk` (`line 57`) enumerates the stops it finds and grades those; it never compares them to a census of controls, so a mouse-only control is simply absent from the sample. And clause **(d)**'s focus **trap** is never asserted — `lines 192-219` test only restore-on-close. I built the census (`critic2-r6b.mjs`) and tabbed 60 times inside each drawer; both pass, but neither was being checked. |
| R7 | `tests/e2e/rubric.spec.ts:256-278` | **No** | Two of the bar's four clauses untested. The test never opens a drawer first, so **"and with a drawer already open"** is unexercised — which is exactly where I found the button occluded on three of three drawers. And the deep-link clause ("clicking a glossary-linked label anywhere opens the glossary *at that term*") has no test anywhere, despite being the stated purpose of `src/ui/primitives/term.ts`. |
| R8 | `scripts/check-issues.mjs` | **Yes, with one hole** | The inventory is hard-coded and independent, and the stale-claim predicates probe the repository. But the detector reads only `docs/issues.md`; it does not read `docs/labels.md`, and it did not catch the stale claim inside `issues.md` §O11 itself (section 6). |
| R9 | `tests/unit/rules.spec.ts` | **Yes** | The strongest test in the suite. It strips comments before scanning, greps by syntactic position rather than by bare token, pins the one permitted alias to `terms-nav.ts:120` by exact location, and asserts the *negative* (no `TRUNCATE` key is dead) as well as the positive. Residue: `.slice(0, 5)` / `(0, 6)` / `(0, 3)` are row limits outside the table, none of which is a rubric-named literal. |
| R10 | none | **No test exists** | The rubric's evidence is "a label→quantity table in `docs/labels.md`, **machine-checked** for uniqueness in both Before and After views". Grepping `scripts/` and `tests/` for `labels.md` returns nothing. R10 is documented and unchecked; I built the check (`critic2-scripts/r10.mjs`) and it passes. |
| R11 | `tests/e2e/screens.spec.ts:118-126` | **Partly** | Asserts the structure readout carries `2,062,196,050.07` and that "fund-entity" appears nearby. Nothing asserts the Σ-feeder counterpart is *labelled*, and nothing asserts "every view-sensitive column header, in both views" — the closest is `exports.spec.ts:198-199`, which checks one tree header incidentally, while proving an export claim. I measured all of them. |
| R12 | `tests/e2e/rubric.spec.ts:291-350` | **Yes** | Symmetric in both directions (control present ⇔ a figure moves), asserts the hidden note occupies zero pixels, and — the part that makes it honest — flips the basis and requires `#screen`'s text to change on exactly the dependent routes and no others. |
| R13 | `tests/e2e/exports.spec.ts` | **Yes on tie-out, no on "on screen"** | The tie-out is real: files parsed from their own bytes, columns addressed by header name, the app's formatters deliberately duplicated so a change cannot move both sides. But every comparison goes through `parityValue` (`tests/e2e/helpers.ts:66-71`), which reads `textContent` and **never checks visibility**. So a figure inside `#pricing-walk-table[hidden]` satisfies "rendered on screen at the moment of export" — which is how five of the Pricing workbook's tied figures and two of the send-to-pricing CSV's four columns are validated. Fixing this is one line: reject a node whose `closest('[hidden]')` is non-null. |
| R14 | `tests/e2e/helpers.ts:22-29` + `expectClean` | **Yes** | Listener on every test, plus an eslint rule and zero empty catches in `src/`. Sound. |
| R15 | `tests/e2e/offline.spec.ts` | **No** | R15 names "all three screens, all four lenses, both drawers and all four exports". The test walks the routes and opens the glossary only — the **sources drawer and all four exports are never exercised offline**, which is where a `vendor/` regression on SheetJS would actually show. I ran them; all pass. |
| R16 | `tests/e2e/rubric.spec.ts:365-387` | **No** | Two gaps, one of them a comment that is false. `line 381` reads "And across a drawer opening and closing, **and a basis flip**" — the code that follows opens the glossary, presses Escape, and re-reads the input. **There is no `#view-toggle` click in the test.** Separately, the criterion's second sentence ("expanded tree rows, sort column, filter text survive leaving and returning to the screen") has no test at all. I performed a real basis flip and all three screen-level checks. |
| R17 | none | **No test exists** | Neither of the two named evidence artefacts exists: no formatter unit-test matrix, no rendered-text decimal-count scan. R17 is the one criterion graded with no shipped machinery whatsoever, and it is the one that fails on measurement. |
| R18 | `tests/e2e/rubric.spec.ts:389-399` + `states.spec.ts` | **Partly** | One combobox, one assertion, and the assertion is `/clear\|try\|widen\|every/` — the word "every" alone satisfies it, so a string like "every fund" passes without any recovery being offered. The filter states in `states.spec.ts` are properly asserted (they click the recovery button and count the rows back). The `None` bucket state the rubric names by name has no test; I reached it manually. |

**The pattern, restated.** The previous critic's diagnosis — "the test was fitted to the code, not to
the criterion" — is still true in three places, and the R2 case has gone from an obvious shortfall to
a concealed one: the token count was restored to 26 while eleven of the rubric's tokens stayed out.
R3, R4, R7, R15 and R16 are narrower versions of the same thing: the test asserts the part of the
criterion the code already satisfies. Against that, R6, R9, R12 and R13's tie-out logic are examples
of the opposite discipline — tests that name what the previous version got wrong and measure the
criterion instead of the implementation. The repository contains both habits.

---

## Claims I could not verify, or found to be false

1. **`docs/first-run.md:122-130` — "No element with that id has ever been rendered." FALSE.**
   Adjudicated below.

2. **`src/ui/drawers/sources.ts:250-258`, rendered in the UI — "the recompute is wired on the
   Reconciliation screen — upload there and the reconciliation, the tree and every price update in
   place, in front of you", and the slot state "Accepted on the Reconciliation screen". FALSE.**
   I followed the link and measured the destination: `fileInputsAnywhere: 0`, `dropTargets: 0`,
   `anythingSayingUpload: []` (`critic2-misc.json` → `r18.afterFollowingUploadLink`). No
   `input[type=file]`, `FileReader` or drop handler exists anywhere under `src/`. This is a false
   claim the operator reads on screen, not merely in a doc.

3. **`docs/labels.md:160-169` §5 "Known gap" — stale, and it says the opposite of the truth.**
   It asserts that `TREE_COLUMNS` keeps the sub-label "current marks" over repriced figures and that
   "the tree header must switch the same way **before R10 and R11 can be scored PASS**". The header
   does switch: `src/ui/screens/reconciliation/tree.ts:136-141` branches on `after` to render
   `at repriced marks`, and I measured it live — `Look-through value current marks` →
   `Look-through value at repriced marks` (`critic2-misc.json` → `r10`). A grader who trusted this
   doc would have failed two criteria that pass. `docs/issues.md` §O11 repeats the same stale claim,
   and `scripts/check-issues.mjs` — whose whole purpose is catching stale dispositions — did not
   flag it.

4. **`docs/labels.md:108` — "Global Qty *(spec only)* → Label to render: **Units outstanding
   (firm-wide)**". Not done, and the stated reason is wrong.** The app renders `Global Qty`
   (`src/ui/screens/pricing/repricing-walk.ts:30`), which I confirmed in the live walk header. The
   file's preamble says `*(spec only)*` marks renames "the frozen map does not cover, **because no
   baseline key carries them**" — but `tests/baseline.json` *does* carry `Global Qty` (substring
   search: present) while `docs/rename-map.json` does not mention it. So the rename is blocked by
   the frozen baseline, not by the absence of a baseline key. R10 still passes because `Global Qty`
   maps to exactly one quantity; the documentation is simply wrong about why it is unchanged.

5. **R7's deep-link clause — could not verify.** `src/ui/primitives/term.ts` states that clicking a
   `.gterm` sets `{ drawer: 'glossary', glossaryFocusTerm: <slug> }` and opens the glossary *at that
   term*. Clicking one does open the glossary with all 35 cards, but I could find no rendered marker
   of *which* term was targeted — no `.focused`/`.on` class on a `.glscard`, no scroll offset I could
   attribute, and `document.activeElement` did not resolve to the term's card
   (`critic2-misc.json` → `r7.deepLink`). There is no test for this clause either. It may work and I
   may have looked for the wrong marker; I am recording it as unverified rather than as a failure.

6. **`tests/e2e/rubric.spec.ts:381` — comment claims a basis flip the test does not perform.**
   See the R16 row above. Not load-bearing for the score, because I performed the flip and the
   selection survived.

7. **`docs/first-run.md:250` and similar "Measured after: …" lines.** Every one I spot-checked
   reproduced (Simulator baseline/subject at 419…490, stage 543…983, market-value input 817…845, Run
   917…945 — my own numbers agree within a pixel or two). I could not check every such line and did
   not need to; R5 is graded on my own measurement, not on these.

8. **`docs/exceptions.md`, `docs/ledger.md`, `docs/PHASE3.md` and the first pass's
   `docs/ux-scorecard.md`** — deliberately not used as evidence for any score in this file.

### Disputed finding 2 — adjudicated: `docs/first-run.md` was corrected in outcome, on a false premise, and the test does not enforce the correction

Three separate questions, three separate answers.

**(i) Is the claim true?** No. `docs/first-run.md:123` says of `#lens-question`: **"No element with
that id has ever been rendered."** Git says otherwise:

```
$ git log --all -p -S"'lens-question'" | grep -n "lens-question"
81:-    el('p', { class: 'lens-question', id: 'lens-question' }),
91:-    qs('#lens-question', host).textContent = LENS_QUESTION[lens];
167:+    el('p', { class: 'lens-question', id: 'lens-question' }),
264:+    qs('#lens-question', host).textContent = LENS_QUESTION[lens];

$ git show 7752a15:trace-pro/src/ui/screens/diagnose/index.ts | grep -n "lens-question"
41:    el('p', { class: 'lens-question', id: 'lens-question' }),
138:    qs('#lens-question', host).textContent = LENS_QUESTION[lens];
```

The element was **added** in `7752a15` ("Phase 2 (3/n): parity tagging, Diagnose shell, combobox,
component styles") and **removed** in `b01ccd3`. `git show b01ccd3:…/diagnose/index.ts | grep
lens-question` returns nothing. So `#lens-question` was a shipped, rendered element for one commit
and was then deleted — the contract document was written against the design that existed, and the
code moved out from under it. The amendment's premise is demonstrably false; the honest sentence
would have been "this id was removed in `b01ccd3` when each lens took ownership of its own
question."

**(ii) Was the substance weakened?** No — the four replacement ids are real. All four render
(`data-quality/index.ts:73`, `ownership/index.ts:76`, `simulator/index.ts:97`,
`structure/index.ts:126`), all four are visible above the fold on load, all four end in `?`, all
four are the first painted text in `#lens-body`. Measured, per lens, in
`critic2-r1-r2.json` and `critic2-r5-above-fold.json`. One id became four ids naming the same four
sentences; nothing was loosened and `isAboveFold`'s predicate is unchanged. The claim in
`first-run.md:275-280` that "this pass changed the *app*" holds up: `.masthead` really is
`position: sticky`, `#structure-stage` really is clamped to `max-height: 42vh`, `.own-ribbon` /
`.own-seg` really are styled (I measured the ribbon at 39 focusable segments, every one ≥ 5×16 px
with a ≥ 3:1 ring), and `#simulator-baseline` / `#simulator-subject` really do exist now.

**(iii) Is the corrected contract enforced?** **No.** The row the amendment rewrote applies to
*every* lens, and the test's `DIAGNOSE_ROWS` (`rubric.spec.ts:206-211`) contains no question row at
all. `#structure-question` and `#data-quality-question` happen to appear in their per-route lists;
`#ownership-question` and `#simulator-question` appear nowhere in the suite. So half the amended
contract is unasserted — the same drift, one layer down. It costs nothing today because I measured
all four and all four pass.

**Verdict.** A legitimate correction, reached by a false argument, and only half-enforced. I would
not revert it. I would (a) strike the false sentence from `first-run.md` and cite `7752a15` →
`b01ccd3` instead, and (b) move the per-lens question row into `DIAGNOSE_ROWS` so the contract the
document now states is the contract the test checks.

---

## Gate verdict

**FAIL.** 15 PASS, 3 FAIL (R2, R4, R17). The rubric admits no partial credit, no "N/A", and is not
negotiable by the designer; one FAIL fails the gate, and there are three.

What it would take, honestly:

| # | Work | Size |
|---|---|---|
| R2 | Mount `termVocabularyLine()` on the Ownership, Data quality and Simulator lenses; expand or link `NAV` in the masthead tagline. | 4 small edits, no new mechanism — the mechanism already exists and works on the three screens that use it |
| R4 | Remove the false upload claim (or ship a real file input); give the Structure lens the loading guard the price table already has; convert the Simulator's fixture read to a `FixtureError` so the operator sees a sentence instead of `TypeError: e.apex.reduce is not a function`. | 3 edits, one of which is a deletion |
| R17 | **Escalate, do not fix.** `tests/baseline.json` is frozen and pins both `+153 bps` (0 dp) and `+1.9 bps` (1 dp), so "one precision per quantity class" and the parity gate cannot both hold. Per `docs/ux-rubric.md:7`, halt and say why. | an owner's decision |

And, separately from the score, three things I would fix because a controller will hit them even
though the rubric's words do not catch them: the Glossary button is occluded and unclickable whenever
any drawer is open (R7); `parityValue()` should reject nodes inside `[hidden]` so R13's "on screen"
means on screen (one line, `tests/e2e/helpers.ts:66`); and `docs/labels.md` §5 plus `docs/issues.md`
§O11 should stop asserting a gap that the code closed, because the next grader will read them.
