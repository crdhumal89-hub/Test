# Progress ledger

Read this before planning each iteration. Newest entry last.

## Definition-of-Done tracker

| # | Item | State |
|---|---|---|
| 1 | build + typecheck + lint all exit 0 | ⬜ not started (Phase 2) |
| 2 | unit tests pass, with direct tests for ownership solve / look-through walk / repricing cascade / reconciliation bridge | ⬜ not started |
| 3 | snapshot of NEW app matches `tests/baseline.json` on every key, zero diffs | ⬜ blocked on Phase 2 |
| 4 | headless suite: 7 screens render, interactions complete, exports produce files, zero console errors | 🟡 harness proves this for the ORIGINAL (0 console errors, 0 offline violations); new-app suite not written |
| 5 | every `docs/ux-rubric.md` criterion passes the critic pass | ⬜ not started |
| 6 | no source file > 400 lines; no data literal > 2,000 chars; fixtures in `data/` | ⬜ not started |
| 7 | zero duplicate top-level identifiers across modules, linter-enforced | ⬜ not started |
| 8 | zero inline `onclick`, zero `!important`, or documented in `docs/exceptions.md` | ⬜ original has 0 inline `on*=` but 61 `!important` |
| 9 | app runs with network disabled | 🟡 harness already runs fully offline (vendored xlsx 0.18.5 + d3 7.8.5) |
| 10 | README explains tree, how to run, how to repoint product/as-of, what each screen answers | ⬜ not started |

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
