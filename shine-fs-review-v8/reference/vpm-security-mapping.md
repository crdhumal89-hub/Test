# VPM Security Mapping — Valuation Policy Memo → Fair Value Method

**Version:** 8.1.0
**Consumed by:** `subagents/mechanical/SKILL.md` (L8 hidden-row intelligence, valuation policy compliance)

This file maps the security types listed in a Fund's Valuation Policy Memo (VPM) to the expected fair value level and method. Mechanical compares the FS Schedule of Investments and the workbook valuation tab against this mapping to flag (a) securities classified inconsistently with the VPM, (b) techniques applied outside their VPM-permitted range, and (c) hidden workbook rows that contradict the visible classification.

---

## Security-type matrix

| Security type | Default ASC 820 level | Default technique | Permitted alternatives | VPM signature cue |
|---|---|---|---|---|
| US Treasuries (on-the-run) | Level 1 | Quoted dealer market | None | "U.S. Treasury securities" |
| Listed equity (large cap, active market) | Level 1 | Closing exchange price | Level 2 only if restricted or thinly traded | "Listed equity securities" |
| Listed equity (small cap, illiquid) | Level 2 | Quoted price adjusted for liquidity | Level 3 if no quote | "Illiquid listed equity" |
| Private equity — control investment | Level 3 | Market multiples (EBITDA/Revenue) and/or DCF | Recent transaction price if <12 months | "Private equity control" / "Portfolio company" |
| Private equity — minority growth | Level 3 | Market multiples (Revenue / EBITDA) | Recent round price | "Growth equity" / "Minority investment" |
| Private debt — performing | Level 3 | DCF using credit-adjusted discount rate | Yield analysis | "Direct lending" / "Private credit" |
| Private debt — non-performing / distressed | Level 3 | Recovery analysis | Comparable distressed yields | "Workout" / "Stressed credit" |
| Real estate — direct | Level 3 | Income approach (DCF) and/or comparable sales | Appraisal | "Real property" / "Direct real estate" |
| Real estate — fund-of-funds | Level 2/3 | NAV practical expedient (ASC 820-10-50-6A) | None | "Real estate fund interest" |
| Hedge fund interest (LP) | NAV-PE | NAV from GP | None | "Investment in [Fund Name] LP" |
| Convertibles | Level 2 or 3 | Bifurcated host + embedded derivative OR FVO | FVO election (ASC 825) | "Convertible note" |
| Warrants — listed underlying | Level 2 | Black-Scholes / observable | Lattice if path-dependent | "Warrants" |
| Warrants — private underlying | Level 3 | Probability-weighted scenario | Black-Scholes on private valuation | "Warrants — private" |
| FX forwards | Level 2 | Forward curve discounting | None | "FX forward contracts" |
| Interest rate swaps | Level 2 | Yield curve discounting | None | "Interest rate derivatives" |
| Total return swaps | Level 2 | Reference-asset price + financing | Level 3 if reference is private | "TRS" / "Total return swap" |
| Credit default swaps | Level 2 | Quoted spread | Level 3 if illiquid name | "CDS" |
| Side-pocket investments | Level 3 | Per VPM (varies — typically last known + impairment review) | None | "Side pocket" / "Restricted investment" |

---

## Detection cues for Mechanical (L8 hidden-row protocol)

When the workbook contains a valuation tab, Mechanical runs the **two-tier hidden-row protocol**:

1. **Tier 1 — visible-rows scan.** Match each visible row's security-type label against the VPM signature cues above. Flag a discrepancy if the row's level or technique disagrees with the matrix.
2. **Tier 2 — hidden-rows scan.** Read hidden rows. If a hidden row's classification disagrees with the visible classification of the same security OR with the VPM matrix, flag as `forensic_ghost` (finding_class). Hidden-row issues are CRITICAL/PROBABLE by default because they typically indicate either a working-paper artifact or an intentional override.

Critically, Tier 2 results do NOT cascade to the orchestrator unless they pass Mechanical's internal hidden-row noise filter (rows present only as scratch / archive / formatting). The orchestrator should never see a flood of hidden-row false positives.

---

## VPM compliance checks (L4 template & policy compliance)

For each investment in the SOI, Mechanical checks:

- **Level matches matrix or VPM-permitted alternative.** Mismatch → L4 finding citing the VPM signature cue.
- **Technique matches matrix.** Mismatch → L4 finding.
- **Pricing source documented.** Workbook references an actual source (broker quote, ASC 820 input table). Source absent → L4/L8 finding.
- **Stale pricing.** Last pricing date > 60 days for Level 2 securities or > 90 days for Level 3 securities (unless VPM explicitly permits longer) → L8 finding.

---

## What the VPM mapping is NOT

This file is the matrix; it is not the VPM itself. Each Fund maintains its own VPM in its own document store (typically Box `_LIBRARY/policy_memos/`). When a Fund's VPM diverges from this matrix (e.g., a specific carve-out for a security type), the Fund's VPM controls — but the divergence must be explicit and documented. Mechanical's L4 finding format for these:

> "Fund VPM at [page/section] permits [alternative]. This investment uses [actual]. Reconcile."

---

## Updating the matrix

Steward workflow per `OWNERSHIP.md` `reference-content` class. New security types are added to the matrix; existing rows are not modified without Architect sign-off because subagent prompts reference this matrix and changing a row affects detection thresholds.
