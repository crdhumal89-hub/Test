# Cross-Layer Patterns — Specificity-Scored Reconciler

**Version:** 8.1.0
**Consumed by:** orchestrator Stage 5d (specificity-scored reconciler)
**Replaces:** v8.0 "first-match-wins" pattern selection

This file defines the patterns the orchestrator uses at Stage 5d to collapse multiple constituent findings (often from different subagents) into a single root-cause finding. v8.1 changes the selection rule from first-match to specificity-scored: ALL patterns are evaluated against each cluster, scored, and the highest-scoring match wins. Every decision is written to `outputs/reconciler-decisions.log` (decision-log discipline).

---

## Scoring formula

For each candidate pattern with all triggers met against a cluster:

```
specificity_score = trigger_conditions × severity_weight × statement_scope_weight
```

Where:
- **trigger_conditions** = count of trigger predicates satisfied for this cluster. More specific patterns (more triggers) score higher than generic patterns.
- **severity_weight** = mapping from the pattern's `severity_floor`: CRITICAL = 4, HIGH = 3, MEDIUM = 2, LOW = 1.
- **statement_scope_weight** = 2.0 when the pattern is bound to a single statement group, 1.0 when cross-statement. Single-statement patterns are preferred because they make more focused root causes.

### Tie-break

1. More trigger_conditions wins.
2. Higher severity_floor wins.
3. Lower pattern_number wins (deterministic).

### Single-consumption rule

A constituent finding can be consumed by at most one root cause. Once consumed in a winning cluster, it is removed from the candidate population for subsequent cluster evaluation.

---

## Pattern library

Each pattern declares: `pattern_number`, `name`, `trigger_set`, `severity_floor`, `statement_scope`, `root_cause_template`.

---

### Pattern 01 — ASU Adoption Cluster

- **trigger_set:**
  1. A Standards (L9) finding with `evidence.asc_reference` matching a current-cycle ASU (e.g., 2022-03, 2023-09, 2024-03).
  2. A Comparative (L10) finding flagging absent transition disclosure or year-over-year accounting policy change.
  3. (Optional, boosts specificity) A Narrative (L3) finding flagging "Recently issued ASUs" note as boilerplate or missing.
- **severity_floor:** HIGH
- **statement_scope:** single (Notes to Financial Statements)
- **root_cause_template:**
  > "Adoption of ASU {asu_number} ({asu_topic}) is not adequately reflected. The accounting policies note, transition disclosure, and recently-issued-ASUs note must be aligned to reflect (a) effective-date applicability, (b) method of adoption, (c) effect on prior periods if restatement, (d) ongoing measurement narrative."

---

### Pattern 02 — Derivative Disclosure Cluster

- **trigger_set:**
  1. A Standards (L9) finding citing ASC 815-10-50-1A, -4A through -4D.
  2. A Mechanical (L2 or L4) finding flagging derivative line-item presentation or netting on SOAL.
  3. (Optional) A Narrative (L3) finding flagging missing volume table or netting reconciliation.
- **severity_floor:** HIGH
- **statement_scope:** cross-statement (SOAL, Notes)
- **root_cause_template:**
  > "Derivative disclosure infrastructure is incomplete. The Fund holds derivatives that require: (a) volume table per ASC 815-10-50-1A, (b) tabular disclosure by category per -4A/-4B, (c) netting reconciliation per -4D / ASC 210-20-50, (d) credit-risk-contingent-features disclosure per -4F."

---

### Pattern 03 — Side-Pocket / Restricted Investment Cluster

- **trigger_set:**
  1. A Standards (L9) finding on ASC 820-10-50-6A (NAV-PE) or Level 3 disclosures.
  2. A Narrative (L3) finding on restricted-investment or side-pocket narrative.
  3. A Mechanical (L4) finding on side-pocket capital roll-forward inconsistency.
- **severity_floor:** HIGH
- **statement_scope:** cross-statement (SOC, SOI, Notes)
- **root_cause_template:**
  > "Side-pocket / restricted investment governance is presented inconsistently across the Statement of Changes (capital classes), Schedule of Investments (designation), and Notes (redemption restriction narrative). Reconcile capital allocations, SOI flagging, and ASC 820-10-50-6A disclosure (redemption notice, unfunded commitments, restriction period)."

---

### Pattern 04 — Related-Party Cascade

- **trigger_set:**
  1. A Narrative (L3) finding on related-party narrative gap.
  2. A Defense (L13) finding on management-fee or carried-interest governance.
  3. (Optional) A Mechanical (L2) finding on related-party receivable/payable line-item.
- **severity_floor:** HIGH
- **statement_scope:** cross-statement (SOAL, Notes)
- **root_cause_template:**
  > "Related-party disclosure infrastructure is partial. The Fund's GP, manager, affiliates, and portfolio-company relationships drive line items on SOAL (receivables/payables) and the management fee / carried interest narrative. Each related-party relationship that generates a line item or expense must be named in the related-party note with (a) nature of relationship, (b) terms, (c) amount, (d) period-end balance."

---

### Pattern 05 — Consolidation Scope Inconsistency

- **trigger_set:**
  1. A Comparative (L11) finding on master-feeder or parallel-fund inconsistency.
  2. A Standards (L9) finding on ASC 946-810.
  3. (Optional) A Defense (L13) finding on consolidation governance.
- **severity_floor:** CRITICAL
- **statement_scope:** cross-statement
- **root_cause_template:**
  > "Consolidation scope is presented inconsistently between the consolidation memo, the FS draft, and (if applicable) sibling-entity FS. ASC 946-810 IC exception requires entity-by-entity assessment; consolidated subsidiaries (if any) must be listed with rationale. Reconcile across consolidation memo, primary statements, and notes."

---

### Pattern 06 — Level 3 Reconciliation Decomposition

- **trigger_set:**
  1. A Standards (L9) finding on ASC 820-10-50-2(c) (Level 3 roll-forward).
  2. A Mechanical (L2) finding flagging Level 3 ending balance ≠ Schedule of Investments Level 3 footing.
  3. (Optional) A Standards finding on ASC 820-10-50-2(f) (significant unobservable inputs).
- **severity_floor:** CRITICAL
- **statement_scope:** single (Notes to Financial Statements)
- **root_cause_template:**
  > "Level 3 reconciliation roll-forward is incomplete or does not tie to the Schedule of Investments Level 3 footing. ASC 820-10-50-2(c) requires opening balance, purchases, sales, settlements, issuances, transfers in/out, realized gain/loss, unrealized gain/loss, ending balance — with the still-held subset disclosed per -50-2(d). The unobservable-inputs table under -50-2(f) must list valuation technique, input, range, and weighted average."

---

### Pattern 07 — Financial Highlights Class Mismatch

- **trigger_set:**
  1. A Standards (L9) finding on ASC 946-205-50 (highlights).
  2. A Comparative (L10) finding on year-over-year highlights presentation change OR (L11) on class-level inconsistency vs sibling FS.
  3. (Optional) A Narrative (L3) finding on per-class breakout.
- **severity_floor:** HIGH
- **statement_scope:** single (Financial Highlights)
- **root_cause_template:**
  > "Financial Highlights are presented inconsistently across partner classes / sibling entities / prior period. Per ASC 946-205-50, each class with materially different capital terms requires its own ratio set. Reconcile per-class breakouts, IRR/Total-Return method, and ratios to average partners' capital."

---

### Pattern 08 — Regulatory + Disclosure Twin

- **trigger_set:**
  1. A Defense (L12) finding with `evidence.regulatory_citation` set.
  2. A Narrative (L3) finding flagging absent disclosure on the same regulatory topic (e.g., custody arrangement, side-letter equivalent treatment, audit reporting framework).
- **severity_floor:** HIGH
- **statement_scope:** single (Notes to Financial Statements)
- **root_cause_template:**
  > "{regulatory_citation} requires disclosure of {topic}, which is absent or boilerplate in the Notes. Align Notes disclosure with regulatory expectation; cite the applicable rule in the note where appropriate."

---

### Pattern 09 — Subsequent Events + Metadata Signal

- **trigger_set:**
  1. A Standards (L9) finding on ASC 855-10-50-1/-50-2.
  2. An orchestrator-emitted Stage-2 entity-verification or Stage-1 metadata-signal finding indicating a known post-balance-sheet event (e.g., investment period expired, GP change, large redemption queue, partial wind-down).
- **severity_floor:** HIGH
- **statement_scope:** single (Notes to Financial Statements)
- **root_cause_template:**
  > "Fund metadata indicates a post-balance-sheet event the subsequent-events note does not address. ASC 855 requires Type I or Type II disclosure with date through which events were evaluated. Update the note to cover the known event."

---

### Pattern 10 — Cover / Entity Identity Cascade

- **trigger_set:**
  1. An orchestrator-emitted Stage-2 cover-page mismatch finding (legal name, domicile, period, presentation).
  2. (Optional, boosts specificity) Any subagent finding referencing the same identity element (e.g., Narrative finding on cover-page header, Mechanical finding on workbook tab name).
- **severity_floor:** CRITICAL
- **statement_scope:** single (Cover)
- **root_cause_template:**
  > "Entity identity is inconsistent between fund metadata, FS cover page, and (where applicable) supporting workbooks. Qualitative materiality applies — this is CRITICAL regardless of dollar impact. Determine the source of truth and reconcile."

---

### Pattern 11 — Going-Concern Trigger

- **trigger_set:**
  1. A Standards (L9) finding on ASC 205-40-50.
  2. A Defense (L13) or (L14) finding referencing wind-down, term expiration, successive losses, or distribution restriction.
- **severity_floor:** HIGH
- **statement_scope:** single (Notes to Financial Statements)
- **root_cause_template:**
  > "Fund profile signals substantial-doubt conditions (wind-down / term expiration / liquidity restriction) without an ASC 205-40 going-concern assessment in the Notes. Either (a) document the absence of substantial doubt with the conditions evaluated, or (b) make the substantial-doubt disclosure with mitigating plans."

---

### Pattern 12 — Comparative Movement With Standards Trigger

- **trigger_set:**
  1. A Comparative (L10) finding showing a material movement in a line item or note.
  2. A Standards (L9) finding citing a measurement / disclosure paragraph for the same line item.
- **severity_floor:** MEDIUM
- **statement_scope:** cross-statement
- **root_cause_template:**
  > "Year-over-year movement on {line_item} crosses the materiality threshold and the applicable ASC paragraph requires expanded disclosure or methodology narrative. Verify the movement is methodology-driven vs. fact-driven, and ensure the corresponding note explains it."

---

## When no pattern matches

If a cluster's findings do not satisfy any pattern's trigger set, the orchestrator does NOT collapse them. Stage 5e (dedup by merge_key) still runs — same-subagent same-merge_key duplicates are still collapsed; different-subagent same-merge_key findings are cross-referenced (each finding's `detail` notes the sibling). This is the "v8.0 cross-reference fallback" preserved in v8.1.

---

## Adding a new pattern (Steward workflow)

1. Open a `[reference-content]` PR.
2. Add the pattern with the next sequential `pattern_number`.
3. Provide at least two prior reviews (anonymized) where the pattern would have correctly collapsed a cluster.
4. Architect reviews trigger_set specificity (avoid over-triggering generic patterns).
5. After merge, the `reference_versions["cross-layer-patterns.md"]` stamp on every finding advances.
