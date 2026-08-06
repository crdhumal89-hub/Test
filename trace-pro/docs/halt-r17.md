# HALT — R17 and the frozen baseline cannot both hold

**Status: still awaiting your decision.** Nothing has been amended. The three options at the foot of
this file are unchanged and none has been chosen.

To be explicit, because it would be easy to misrepresent: the reply to this HALT was "fix them all",
given against a review where R17 was presented as a three-way choice rather than a fix. That is not a
selection of any option, and it is not recorded here as one. R17 remains a **FAIL** in the meantime,
which is the accurate state and is what the scorecard and the gate report.

**What was fixed anyway, because it required no decision and moved no figure.** R17's bar is "one
documented rule per quantity class". The precision cannot be unified, but the *number of places deciding it* could be,
and four were reduced to one:

| Was | Now |
|---|---|
| `price-table.ts` typed `bps.toFixed(0)` | calls `formatBpsInteger` (exception E2) |
| `reconciliation/detail.ts` typed it twice, in prose | calls `formatBpsInteger` |
| `glossary/terms.ts` typed it | calls `formatBpsInteger` |

`grep -rn 'toFixed(0)' src --include=*.ts` now returns no *call* outside `src/domain/money.ts`, where
the two exceptions are declared and each names the strict baseline keys that force it. It returns four
lines: the one live call at `money.ts:116`, the E1 formatter at `money.ts:103`, and two comments —
`money.ts:112`, whose "currently inlines `bps.toFixed(0)`" is itself now stale, and
`price-table.ts:102`, which records the routing. Verified after
the change: parity 1020/1020, 978 strict, 42 declared-label, 0 digit violations, **0 diffs** — the
rendered strings are byte-identical, which is the point. What remains is a precision that is wrong by
the rubric's bar and right by the baseline's, decided in one place instead of four.

The mission says: *"If you believe one is genuinely wrong, HALT and tell me why; do not amend it and
continue."* This is that. Two frozen artifacts contradict each other, and I cannot satisfy both.
I am not touching either.

## The two artifacts

| Artifact | Frozen at | Says |
|---|---|---|
| `docs/ux-rubric.md` §R17 | Phase 0 | "one documented rule per quantity class, applied everywhere: … **bps 1dp**" |
| `tests/baseline.json` | Phase 1 | pins the same quantity at **0dp in one place and 1dp in another** |

## The contradiction, at one fund

`ASCHON`'s repricing gain-or-loss in basis points is computed by one expression, written identically
in two files:

- `src/ui/screens/pricing/price-table.ts:109` — `const bps = bpsOf(fund.pnlLevel, fund.nav);`
- `src/ui/screens/pricing/repricing-walk.ts:133` — `const bps = bpsOf(fund.pnlLevel, fund.nav);`

The frozen baseline pins the rendered result of that one expression twice, at two precisions:

```
pricing.fund.ASCHON.pnl_bps        = "2"        <- 0dp, unsigned  (price table)
pricing.walk.fund.ASCHON.delta_bps = "+1.9"     <- 1dp, signed    (repricing walk)
pricing.bridge.driver.ASCHON.gap_bps = "-958 bps"  <- 0dp, signed, suffixed (bridge)
```

Both `pnl_bps` and `delta_bps` are **STRICT** keys — compared byte-for-byte, not declared relabels.
The two tables sit on the same screen, one click apart, showing the same 26 funds. A controller can
see `2` and `+1.9` for the same fund in the same minute.

There are 26 `pricing.fund.<CODE>.pnl_bps` keys at 0dp and four `pricing.bridge.*.gap_bps` keys at
0dp. Rendering any of them at 1dp changes a digit, which fails `npm run gate:parity`.

## Why there is no way out inside the rules

1. **Fix the code to satisfy R17** → `"2"` becomes `"1.9"`. That is a changed reported figure on 30
   strict keys. It fails PARITY, and it violates the mission's primary constraint: rebuild
   *"without changing a single figure it reports."*
2. **Route it through `docs/rename-map.json` as a declared label change** → blocked by design. The
   digit guard requires `numericTokens()` to be an identical ordered sequence; `153` → `153.0` and
   `2` → `1.9` both change that sequence. The guard exists precisely to stop a "relabel" smuggling a
   changed number, and it is working correctly here.
3. **Amend the rubric so R17 permits named exceptions** → that is editing a frozen artifact to make
   a check pass, which is the one thing I am forbidden to do unilaterally. It is also *your* call
   whether the bar was wrong, not mine.

So R17, as written, is unsatisfiable on this baseline. This is not a defect in the rebuild — it is a
faithful reproduction of a defect **in the original**, which really did render the same quantity at
three precisions. The rubric asked for that to be fixed; the parity contract forbids fixing it.

## What is currently in place

`src/domain/money.ts` documents one rule (1dp, explicit sign) plus exactly two named exceptions, each
naming the strict keys that force it — E1 `formatBpsCompact` (the bridge) and E2 `formatBpsInteger`
(the price table) — and states that they are parity constraints on this baseline rather than design
intent, so a future re-cut deletes them. That is the most honest state reachable without breaking one
of the two artifacts. An independent critic still grades R17 **FAIL**, and I agree with that grade:
documented variance is still variance, and the rubric said "applied everywhere".

The loose end this section used to record — `price-table.ts` inlining `bps.toFixed(0)` rather than
calling `formatBpsInteger` — is **closed**, along with two more copies it had not spotted in
`reconciliation/detail.ts` and one in `glossary/terms.ts`. See the table at the top of this file. That
was the whole of the work available without a decision from you.

## Your options — my recommendation is (a)

**(a) Accept R17 as a FAIL and ship.** Parity stays intact, the exceptions stay documented and
confined to two files, and the scorecard records an honest 17/18 with a named, reasoned cause. This
keeps the mission's primary promise — no reported figure moves — and pays for it with one rubric
criterion that the frozen baseline made unreachable.

**(b) Re-cut the baseline at 1dp.** R17 passes and the app becomes internally consistent, but
`tests/baseline.json` is no longer the original's figures, so the parity gate stops meaning "reports
what the original reported". This is only sensible if you decide the original's inconsistent bps
precision was itself a bug worth correcting in the reported output. That is a change to reported
figures and is outside this run's remit.

**(c) Amend R17 to allow parity-forced exceptions that are documented and enumerated.** The rubric
then matches what the constraints actually permit. Cheapest path to a green gate, and the one most
open to the charge of moving the goalposts — which is why I am not doing it on my own authority.

Tell me which, and I will implement it. Until then R17 stays FAIL and the gate stays red on the UX
CRITIC sub-gate, which is the accurate state.
