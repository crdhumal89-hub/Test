# ASC Matrices — SHINE Standards Reference

**Version:** 8.1.0
**Last attestation:** 2026-05-17
**Consumed by:** `subagents/standards/SKILL.md` (L9 ASC framework compliance)

This file is the canonical mapping from ASC topic → applicable paragraphs → SHINE detection cues for L9 findings. Standards MUST cite the paragraph in `evidence.asc_reference` for every L9 finding (invariant rule 13). Standards MUST report applicable-paragraph coverage in its `coverage-manifest.json` (rule 7, 100% applicable rule).

Each matrix lists: paragraph, requirement, common omission, detection cue, default severity.

---

## ASC 946 — Investment Companies

### 946-10 — Scope and assessment
- **946-10-15-4 through -15-9** — Investment-company assessment criteria. *Detection:* If structure type changed YoY or the LPA suggests non-IC purposes, look for an explicit IC-status disclosure. **Common omission:** new fund entities relying on parent-fund IC status without standalone assessment. Default severity: HIGH/PROBABLE.

### 946-205 — Presentation
- **946-205-45-1** — Required primary statements (SOAL, SOO, SOC, SOI, Financial Highlights). *Detection:* missing statement, or SOC presented as a note. Default: CRITICAL/CERTAIN.
- **946-205-45-2** — SOCF election-out criteria. *Detection:* SOCF presented when fund could elect out (often signals copy-paste from corporate template); OR SOCF absent without the four-criteria attestation. Default: MEDIUM/PROBABLE.
- **946-205-50-1 through -50-12** — Financial highlights ratios. *Detection:* missing IRR for closed-end funds, missing expense ratio, missing per-class breakouts when capital structure differs. Default: HIGH/CERTAIN if missing entirely, MEDIUM if incomplete.

### 946-210 — Statement of Assets and Liabilities
- **946-210-45-1** — Investments at fair value caption. *Detection:* line labeled "Investments at cost" without parallel fair value column. Default: CRITICAL/CERTAIN.
- **946-210-45-3** — Receivables/payables for unsettled trades. *Detection:* gross presentation when net required, or vice versa. Default: MEDIUM/PROBABLE.
- **946-210-50-6** — Schedule of Investments >5% concentration disclosure. *Detection:* aggregated "Other investments" line >5% NAV without name-level breakout. Default: HIGH/CERTAIN.
- **946-210-50-9** — Securities sold short / written options disclosure. *Detection:* short positions not separately captioned. Default: HIGH/CERTAIN.

### 946-220 — Statement of Operations
- **946-220-45-3** — Realized vs unrealized separation. *Detection:* combined "gain/loss on investments" without bifurcation. Default: HIGH/CERTAIN.
- **946-220-45-7** — Expense disaggregation. *Detection:* "Other expenses" >10% of total without breakdown. Default: MEDIUM/PROBABLE.

### 946-230 — Statement of Cash Flows
- **946-230-45-1** — Election out conditions. *Detection:* SOCF presented when conditions met; or absent without disclosure. Default: MEDIUM/PROBABLE.

### 946-505 — Capital and Equity
- **946-505-50-7** — Partner-class disclosure. *Detection:* GP/LP capital combined when class differs materially. Default: HIGH/PROBABLE.

### 946-810 — Consolidation (Investment Company Exception)
- **946-810-45-1 through -45-3** — IC exception scope. *Detection:* consolidation of operating subsidiaries when IC exception applies. Default: CRITICAL/CERTAIN.
- **946-810-50-1** — Disclosure of consolidated entities and rationale. *Detection:* consolidated subsidiaries listed but rationale absent. Default: HIGH/CERTAIN.

---

## ASC 820 — Fair Value Measurement

### 820-10-50 — Fair value disclosures (the high-density matrix)
- **820-10-50-1** — Class-level disclosure framework. *Detection:* securities aggregated into one class when classes have materially different risk profiles. Default: HIGH/PROBABLE.
- **820-10-50-2(b)** — Level 1/2/3 categorization table. *Detection:* table absent, or levels swapped vs the description. Default: CRITICAL/CERTAIN.
- **820-10-50-2(bbb)** — Significant transfers between levels. *Detection:* transfers visible in roll-forward but no disclosure of timing/reason. Default: HIGH/CERTAIN.
- **820-10-50-2(c)** — Level 3 reconciliation roll-forward. *Detection:* opening/closing balances present but no purchases/sales/transfers/realized/unrealized columns; OR ending balance does not tie to SOI Level 3 footing. Default: CRITICAL/CERTAIN.
- **820-10-50-2(d)** — Realized/unrealized on still-held assets. *Detection:* total realized/unrealized disclosed but not the still-held subset. Default: HIGH/PROBABLE.
- **820-10-50-2(f)** — Significant unobservable inputs (Level 3) — quantitative table. *Detection:* qualitative description provided but no range/weighted-average table; OR table missing valuation technique column. Default: CRITICAL/CERTAIN.
- **820-10-50-2(g)** — Valuation process narrative. *Detection:* boilerplate "the Fund follows ASC 820" without entity-specific governance description. Default: HIGH/PROBABLE.
- **820-10-50-2(h)** — Sensitivity narrative for Level 3. *Detection:* narrative says "changes in inputs would not materially affect FV" without basis. Default: MEDIUM/PROBABLE.
- **820-10-50-6A** — Investments measured at NAV practical expedient. *Detection:* NAV-PE used but redemption restrictions, unfunded commitments, redemption notice period not disclosed. Default: HIGH/CERTAIN.
- **820-10-50-9** — Liabilities measured at fair value. *Detection:* short positions or written options not in the Level table. Default: HIGH/CERTAIN.

### 820-10-35 — Measurement principles
- **820-10-35-9** through **-35-16** — Principal/most advantageous market, transaction-cost treatment, unit of account. *Detection:* aggregate or block valuation where unit of account is individual; or transaction costs included in fair value. Default: MEDIUM/PROBABLE.

---

## ASC 815 — Derivatives and Hedging

### 815-10-50 — Derivative disclosures
- **815-10-50-1A** — Volume of derivative activity. *Detection:* derivatives on BS or SOI but no volume table (notional or fair value by category). Default: HIGH/CERTAIN.
- **815-10-50-4A through -4C** — Tabular disclosure by category. *Detection:* categories aggregated; missing fair value, gain/loss, location in primary statements. Default: HIGH/CERTAIN.
- **815-10-50-4D** — Netting / offsetting disclosure. *Detection:* derivatives netted on BS but ASU 2011-11 / ASC 210-20-50 reconciliation absent. Default: HIGH/PROBABLE.
- **815-10-50-4F** — Credit-risk-related contingent features. *Detection:* ISDA agreements with credit triggers but no disclosure. Default: HIGH/POSSIBLE (often a gap, often immaterial — controller question).

### 815-20-25 — Hedge designation
- **815-20-25-1 through -25-3** — Designation conditions. *Detection:* "hedge" language in narrative but no formal designation evidence. Default: HIGH/POSSIBLE.

---

## ASC 825 — Financial Instruments

### 825-10-50 — Fair value option
- **825-10-50-28 through -50-32** — FVO election disclosures. *Detection:* FVO applied to debt but election rationale and basis difference vs amortized cost absent. Default: HIGH/CERTAIN.
- **825-10-50-10** — Concentrations of credit risk. *Detection:* single-issuer or single-industry concentration >10% NAV without disclosure. Default: HIGH/PROBABLE.

---

## ASC 480 — Distinguishing Liabilities from Equity

### 480-10-25 — Classification
- **480-10-25-4** — Mandatorily redeemable instruments. *Detection:* redeemable preferred or partner classes with fixed redemption date classified as equity. Default: CRITICAL/PROBABLE (requires LPA review).
- **480-10-25-8** — Obligations to issue variable shares. *Detection:* warrants or convertibles with variable-share features mis-classified. Default: HIGH/POSSIBLE.

---

## ASC 326 — Credit Losses

- **326-20-15-3(c)** — Scope exclusion for investment companies under ASC 946. *Detection:* CECL allowance disclosed by an IC (likely template copy-paste); OR a non-IC fund vehicle missing CECL where applicable. Default: MEDIUM/PROBABLE. *Standards SHOULD document IC scope-out in coverage manifest with reason code.*

---

## ASC 740 — Income Taxes

- **740-10-50-15** — Uncertain tax positions for pass-throughs. *Detection:* "no UTP" boilerplate without entity-specific assessment; OR PFIC/CFC exposures undisclosed. Default: MEDIUM/PROBABLE.
- **740-30-25-17** — Outside basis differences for blockers. *Detection:* blocker corp DTL on outside-basis absent. Default: HIGH/PROBABLE.

---

## ASC 205-40 — Going Concern

- **205-40-50-1 through -50-14** — Substantial doubt assessment and disclosure. *Detection:* fund in wind-down, term expired, or successive losses with no going-concern note. Default: HIGH/CERTAIN if conditions present; default not-applicable disclosure NOT required when no doubt exists.

---

## ASC 855 — Subsequent Events

- **855-10-50-1, -50-2** — Type I recognized / Type II non-recognized disclosure. *Detection:* fund metadata indicates known post-balance-sheet events (term expiration, GP change, large redemption request, partial liquidation) and FS draft has only the boilerplate "no subsequent events" note. Default: HIGH/PROBABLE.
- **855-10-50-4** — Date through which subsequent events evaluated. *Detection:* date missing or earlier than expected issuance date. Default: MEDIUM/CERTAIN.

---

## ASC 250 — Accounting Changes and Error Corrections

- **250-10-50-1 through -50-3** — Accounting change disclosure. *Detection:* methodology change (e.g., valuation technique pivot for Level 3) without 250 disclosure. Default: HIGH/CERTAIN.

---

## ASC 105 / ASU adoption tracking (current cycle)

The Standards subagent maintains this rolling list. As of 2026-05-17 attestation:

| ASU | Effective | Applicable to ICs | Detection cue |
|---|---|---|---|
| ASU 2022-03 | FY 2024+ | Yes — equity securities with contractual sale restrictions | Look for restricted-stock holdings; verify fair value not discounted for sale restriction |
| ASU 2023-07 | FY 2024+ public, FY 2025+ private | Limited (segment reporting; rare for funds) | Generally N/A for partnership funds |
| ASU 2023-09 | FY 2025+ | Yes — income tax rate reconciliation | For taxable blockers and corporate funds |
| ASU 2024-03 | FY 2027+ | Yes — expense disaggregation | Track for upcoming transition disclosure |

Detection for adoption cycle: Recently-issued ASUs note must list applicable ASUs and expected effect. Boilerplate "the Fund is evaluating" is acceptable for non-adopted; not acceptable when effective date passed.

---

## Coverage discipline

Standards MUST emit a `coverage-manifest.json` with:
- `asc_paragraphs_applicable` — every paragraph above that maps to a population element observed in the FS (e.g., Level 3 reconciliation paragraphs are applicable when Level 3 investments exist).
- `asc_paragraphs_checked` — paragraphs the subagent actually evaluated.
- `asc_paragraphs_not_checked` — paragraphs deliberately not evaluated, each with a `reason_code` from: `NOT_APPLICABLE`, `SUBPOPULATION_ABSENT`, `OUT_OF_SCOPE_THIS_REVIEW`, `INPUT_MISSING`.

Per invariant rule 7, no paragraph may be skipped silently. The orchestrator's Stage 6 roll-up enforces this.

---

## Notes on framework pluggability (council Severity-3, deferred)

This file currently encodes US GAAP / ASC 946. Future pluggability (IFRS / Lux GAAP / Cayman exempted-fund GAAP variants) is council Severity-3 and deferred to post-migration. When implemented, this file becomes `reference/frameworks/us-gaap-asc-946.md` with sibling framework files; Standards SKILL.md is parameterized on framework choice from `_FUND-METADATA.json`.
