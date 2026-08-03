# Progress ledger

Read this before planning each iteration. Newest entry last.

## Definition-of-Done tracker

| # | Item | State |
|---|---|---|
| 1 | build + typecheck + lint all exit 0 | ✅ **PASS** — `npm run build` 0, `tsc --noEmit` 0, `eslint` 0, structure 0, fixture check 0 |
| 2 | unit tests pass, with direct tests for ownership solve / look-through walk / repricing cascade / reconciliation bridge | ✅ **PASS** — 105 tests, all four areas, plus a differential test against the original's solve |
| 3 | snapshot of NEW app matches `tests/baseline.json` on every key, zero diffs | 🟡 all screens built and tagged; second full run in flight after fixing 11 scene errors |
| 4 | headless suite: 7 screens render, interactions complete, exports produce files, zero console errors | 🟡 suite written (rubric + screens + offline); not yet run green end to end |
| 5 | every `docs/ux-rubric.md` criterion passes the critic pass | ⬜ pending — will be graded by an agent with no design context |
| 6 | no source file > 400 lines; no data literal > 2,000 chars; fixtures in `data/` | ✅ **PASS** — enforced by `scripts/check-limits.mjs` in the lint step; 614 KiB now in `data/` |
| 7 | zero duplicate top-level identifiers across modules, linter-enforced | ✅ **PASS** — 175 top-level identifiers in `src/`, all unique, machine-checked |
| 8 | zero inline `onclick`, zero `!important`, or documented in `docs/exceptions.md` | ✅ **PASS** — 0 and 0, machine-checked, no exceptions file needed yet |
| 9 | app runs with network disabled | ✅ **PASS** — 0 offline violations; xlsx 0.18.5 + d3 7.8.5 vendored |
| 10 | README explains tree, how to run, how to repoint product/as-of, what each screen answers | ✅ **PASS** — `README.md` 301 lines, every command and path verified against the repo |

---

## Iteration 1 — Phase 0: read the original, write the spec and rubric

**Tried.** Located the artifact (it was not in the repo; the user supplied
`TRACE_Platform__PATCHED.html`). Extracted TRACE-Pro from the platform shell, where it ships as a
JS string literal on shell line 171 assigned to `iframe#frame-pro.srcdoc` — 934,142 bytes,
2,520 lines. Read it end to end. Audited it with an `acorn` AST parse rather than grep.

**Found.** 184 top-level function declarations + 17 function-valued consts + 55 data vars (the
brief said 197 + 142). 728 functions counted anywhere. **Zero** TODO/FIXME/HACK markers — the
brief's "12" is a grep for `XXX` matching the entity code `CAXXXII`. 617 KiB of data literals in
5 blobs. Five identifier collisions (`LTV` ×4, `walk` ×2, `N` ×2, `P` ×2, `CUR` ×2). Dead code
(`PF`, `Q`, `vchip`, `ragc`, `recActive`) and dead data (`EMB.recon` 23 rows, `dcN`, `resid`,
`apexPos`, `grandVar`, 7 `PRICING` fields, 5 `REC` fields). Two parallel reconciliation engines
(`REC` and `REVISE`) where only `REVISE` renders. Two separate fullscreen implementations. Four
copies of the $250k/50bps materiality rule. **Two product NAVs $2,785.79 apart** — `EMB.prodNAV`
(fund-entity basis) on the Structure full-screen readout vs `REVBASE.N` (Σ apex ENDING_NAV)
everywhere else; the difference is exactly the DUNK feeder's NAV.

**Sub-gates.** N/A — design phase, no code.

**Written.** `docs/redesign-spec.md` (7-screen inventory, 3 refined IA alternatives, rename table,
module plan, data plan, 8 open questions), `docs/ux-rubric.md` (18 criteria: 8 seeded + 10 from
findings).

**Open hypothesis.** Rubric criterion 8 as seeded has no subject. Restated as R8 against the real
defect inventory rather than deleted. Raised as open question Q4.

---

## Iteration 2 — Phase 1: baseline harness

**Tried.** Froze the original + sibling + shell read-only under `reference/`. Vendored the two CDN
dependencies from npm (`xlsx@0.18.5`, `d3@7.8.5` dist artifacts). Wrote a DOM probe to author
selectors from observed fact, then `parity-map.json`, then `scripts/snapshot.mjs`.

**Found — nondeterminism audit.** The original contains **no** `Math.random`, `new Date`,
`Date.now`, `performance.now`, or locale-date formatting. Every figure is a pure function of the
fixtures; `asof` is a data field. The real risks are: `sessionStorage` (3 keys —
`tracePricingMode`, `traceSimTheme`, `traceChrome`) leaking between runs, 24 `setTimeout`-deferred
renders, `d3.forceSimulation` in the Structure "Dynamic" layout only (not the default), 10 d3
transitions, and 5 `clientWidth`/`clientHeight` reads. Pinned by: a **fresh browser context per
scene**, DOM-stability polling instead of sleeps, fixed 1600×1000 viewport, `en-US`/UTC, reduced
motion, Vertical layout as the default, and cdnjs fulfilled from `vendor/`.

Also found: cdnjs answers **403** through this environment's proxy, so the original cannot render
here at all without the vendored interception. Vendoring was load-bearing, not hygiene.

**Fixed 3 map defects the harness caught** (Phase 1 explicitly expects this — an unresolved key
means the map is wrong):
1. The Repricing Walk total row's first cell is `colspan="3"`, so it has 10 `<td>`, not 12. My
   indices were reading NAV→Value-before, Value-before→Value-after, Value-after→ΔValue and two
   keys off the end. **This was reading the wrong figures while appearing to resolve** — the exact
   failure mode the gate exists to catch.
2. `#simscore .prow:last-of-type` matches nothing: the last child is `.shockline`, not a `.prow`.
   Replaced with explicit indices; added `nonposition` and `shockline` keys.
3. A fund's role chip is absent for mid-level funds (neither apex nor terminal). Re-pointed at the
   cell with the name excluded, so `""` is a *resolved* value meaning mid-level. Harness now
   distinguishes "selector matched nothing" (unresolved, a failure) from "matched, renders empty"
   (resolved).

**Sub-gates.**
- STATIC: N/A this iteration (no app source yet).
- UNIT: N/A this iteration.
- PARITY: **PASS.** 1,020/1,020 keys resolved. 3 consecutive runs byte-identical
  (`sha256 2e320937fd6ae66f…`). Self-diff against the frozen baseline: **0 value diffs**.
  0 console errors, 0 offline violations, 0 scene errors, across 22 scenes.
- UX CRITIC: N/A this iteration (nothing built to grade).

**Spot-checked for semantic correctness, not just stability.** Waterfall, Repricing Walk total,
and the completed simulator reprice all land on the same figures — D $2,060,224,441 /
R $2,060,610,338 / N $2,062,198,836, ΔPricing $385,897, ΔNon-position $1,588,498, and the
simulator to the cent ($2,060,610,338.29). `structure.fullscreen.product_nav` captures
`$2,062,196,050.07`, so the $2,785.79 discrepancy is **pinned as a fact** rather than averaged
away. 26 funds, 149 expanded tree rows, 39 immediate owners of APPOURI, 12 ultimate-owner rows,
35 glossary terms.

**`tests/baseline.json` is now frozen evidence. `parity-map.json` is now frozen.**

**Current parity diff count: 0 (against the original — the new app does not exist yet).**

**Live hypothesis for the top remaining risk.** Not parity mechanics — those are proven. It is
DoD item 6 versus the Simulator: `SIM` is a third copy of the structure and the sim graph +
animation code is ~600 lines of tightly coupled d3. Splitting it under 400 lines per file without
changing a rendered figure is the hardest single piece of Phase 2, and it is scheduled last for
that reason.

**Blocked on:** the Phase 0 approval gate — specifically which of the three IA alternatives to
build. Phase 1 was independent of that choice (it runs against the original and keys on
semantics), which is why it proceeded. Phase 2 is not.

---

## Iteration 3 — Phase 2: toolchain, fixtures out of source, the math layer

**Approved at the gate:** IA **Alternative B** (Reconciliation → Pricing → Diagnose, with Structure
/ Ownership / Data quality / Simulator as four lenses over one selected entity). Q1 preserve both
product NAVs and label their bases. Q4 accept rubric R8 as restated.

**Also approved, after I raised it:** the 37 non-glossary label keys conflict with the rename table,
so the gate splits — 983 keys byte-identical, 37 label keys checked against a frozen
`docs/rename-map.json` with a digit guard asserting every embedded figure survives unchanged.
Neither `parity-map.json` nor `tests/baseline.json` is edited.

**Tried.** Vite 8 + TypeScript 6 + Vitest 4 + ESLint 10 + Playwright 1.56. Extracted the five data
blobs to `data/<product>/<as-of>/*.json`, fetched at runtime, with `--check` asserting deep equality
against the original so a fixture cannot drift. Then the math, before any UI.

**Found — two things the tests pin rather than smooth over.**
1. 5 of 514 entities do not conserve ownership: `ABFSUB6` reaches **129.29%** through a single
   parent (`ABFAGB`) because of the circular holdings the Issue Log reports as High, and `MIDCAP`
   reaches only **3.10%**. The extracted solve is **bit-identical to the original** across all 514
   entities and 1,000+ parent weights, so this is a data condition, not a solver fault — but the
   original's footer claim "ownership per node sums to 100% … verified to conserve" is overstated.
2. `lookthrough.grand` and `repricing.D` differ by ~4e-7 from summing in different orders. Both
   round to `$2,060,224,441`, which is why the original can show them side by side without a visible
   discrepancy.

I wrote three assertions that the real data falsified, and corrected the assertions rather than the
code — after proving differentially that the code was right.

**Sub-gates.** STATIC pass. UNIT 105 pass. PARITY unchanged (no UI yet). UX CRITIC n/a.

## Iteration 4 — Phase 2: the Reconciliation screen

**Tried.** Shell (masthead, nav, pricing-basis control, drawer hosts) and the Reconciliation screen:
question line, waterfall, exception strip, hierarchy, per-row drawer with a focus trap.

**Verified by direct comparison against `tests/baseline.json`:** every waterfall figure, the tie
status, all three exception chips with their counts, all five totals-row figures, and the 9 default
tree rows. Zero console errors, zero network requests.

**Found.** Two false positives in my own structure checker — TypeScript `interface` bodies read as
data literals, and the words `!important` inside a CSS comment read as a declaration. Both fixed in
the checker, not worked around in the source.

**Sub-gates.** STATIC pass (build 0, tsc 0, eslint 0, structure 0, fixtures 0). UNIT 105 pass.
PARITY partial — see Done item 3. UX CRITIC not yet gradeable.

**Current parity diff count: 0 on every key the built screen owns.**

**Live hypothesis for the top remaining risk.** Unchanged and now closer: the Simulator lens. It is
a third copy of the structure plus ~600 lines of coupled d3 and animation, and its staged reprice
must land on the waterfall figures *to the cent* (baseline has `$2,060,610,338.29`). It stays
scheduled last.

**Remaining, in order:** Pricing screen · Diagnose shell + 4 lenses · Glossary drawer (35 terms) ·
Sources drawer · `rename-map.json` + `selectors.new.json` + the digit guard in `snapshot.mjs` ·
Playwright suite · README, `issues.md`, `exceptions.md`, `labels.md`, `first-run.md` · independent
rubric critic pass · full 1,020-key parity run.

---

## Iteration 5 — Phase 2: six parallel agents, then integration

**Tried.** Ran six agents on disjoint directories (Pricing · Glossary+Sources · harness+rename map ·
Ownership+Data quality · Structure+Simulator · documentation) and kept every shared file — `main.ts`,
`store.ts`, `shell.ts`, the stylesheets, `parity.ts` — to myself, so no two writers ever touched one
file. All six landed.

**The convention that made it work.** Every figure publishes the semantic key it answers to,
`data-parity="reconciliation.waterfall.nav"`, straight from the frozen map. The harness reads the
attribute in preference to the map's selector, so it needs no knowledge of the new layout, and
parity becomes self-documenting at the point of render.

**Found — the blocker nobody had hit.** Extraction was the briefed half; NAVIGATION was not. The
frozen map names its scenes in the original's vocabulary (`screen: lt`, `view: after`), so the
harness was clicking `.tab[data-tab="lt"]` and `#pricetog` — controls this rebuild does not have.
First full run: **11 of 22 scenes never ran, 10 keys unresolved, gate correctly FAILED.** Fixed by
extending the same idea to controls: `data-parity-scene="screen:lt"`, with fallback to the
original's selector, so one harness drives both targets. The four folded lens links that carry
`screen:str|own|iss|sim` are a real accessibility feature, not scaffolding — one-hop keyboard access
to a lens.

**Found — three defects of mine, by the documentation agent verifying the spec against the repo
rather than trusting it.** `main.ts` seeded the Diagnose default from the first vehicle node, giving
`ASCON`, when the baseline pins the Ownership lens on `APPOURI` — which is not in this product's
look-through tree at all, so it can never be derived and is now declared in `data/manifest.json`.
The look-through column's sub-label was fixed at "current marks" while its cells carry the repriced
quantity under the repriced basis — the exact R10 defect the rebuild exists to remove. And three of
six above-the-fold selectors were written against CSS classes the rendered output never uses.

**Found — a real classifier bug, by the Simulator agent.** Term matching was case-sensitive, so
`Δ Pricing` in a header was caught but `Δ pricing` mid-sentence was not, leaving
`simulator.reprice.shockline` STRICT while the declared entry for the paragraph containing it
relabelled those same words. One sentence cannot be both. Blanket case-insensitivity is also wrong —
it captures "how this % is derived", where `derived` is a verb. Matching is now case-insensitive per
term EXCEPT the bare words `Derived`/`Revised`, which match only capitalised, which is how the
original writes them when they ARE labels. **Declared set: 41, not the 37 I first quoted.**

**Found — the digit guard earning its place twice.** It rejected my own appending of an as-of date to
a basis line (three digits injected into a string that had none), and its self-check now proves all
eight cases: digits added, removed, changed, reordered, un-glued, sign-flipped.

**Decided without escalating, per instruction.** The baseline requires the footer to assert ownership
is "verified to conserve". It is not — five of 514 entities cannot close. Shipping that verbatim
would hand a controller a false control statement, so it is a declared label change preserving the
numeric token, NOT a byte-parity match. The Ownership lens goes further: its conservation sentence is
conditional on the position displayed, with a runtime audit naming all five and their measured
shares, computed rather than hardcoded so it cannot go stale.

**Sub-gates.** STATIC pass — build 0, tsc 0, eslint 0, structure PASSED (439 top-level identifiers
all unique, 0 inline `on*=`, 0 `!important`, no file over 400 lines), fixtures deep-equal the
original, classify 0 with 41/41 digit-guarded. UNIT 105 pass. PARITY second run in flight. UX CRITIC
not yet run.

**Live hypothesis for the top remaining failure.** The declared-label keys are the residual risk, not
the figures: 41 strings must match a frozen declaration exactly, and several are long prose where a
single word or a missing space between adjacent inline elements is a diff. I have already hit that
twice (the tie statement's missing space, the column headers' glue). Expect the next run's diffs to
be concentrated there rather than in any number.
