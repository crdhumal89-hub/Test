# Council Review — v8.0 Retrospective and v8.1 Remediation

**Council date:** 2026-05-15
**Subject of review:** SHINE v8.0 (released 2026-05-16) — first decomposed-architecture release.
**Outcome:** 4 Severity-1, 6 Severity-2, multiple Severity-3, several Severity-4 items.
**v8.1 disposition:** all Severity-1, all Severity-2, all Severity-4 closed pre-migration. Severity-3 deferred per council's own priority sequencing.

This document is the audit trail for the v8.0 → v8.1 increment. It is referenced from `SKILL.md` (top-of-file note).

---

## Council composition

- Architect — Ashitosh Shinde
- Steward — (rotating; the council chose to defer steward designation to v8.1 release window)
- Approver — VP Controllership designate
- Independent reviewers (peer Controllership leads) — 2 invited

---

## Severity classification used by the council

- **Severity-1** — invariant violation OR correctness gap that would distort the controller's verdict on a real review. Must close before parallel-run.
- **Severity-2** — measurable signal degradation (silent skips, voice destruction, missing telemetry). Should close before parallel-run.
- **Severity-3** — architectural refactor for maintainability or scalability; not blocking correctness. Deferred to post-migration.
- **Severity-4** — governance, polish, and naming items. Mostly closed immediately as part of the v8.1 increment.

---

## Severity-1 items (4) — ALL CLOSED in v8.1

### S1-1 — First-match-wins reconciler pattern selection
**Problem:** v8.0's pattern selector took the first pattern with all triggers met. Order in the pattern file determined the outcome; specificity did not.
**Impact:** Generic patterns intermittently consumed clusters that more specific patterns were designed for. Root causes were wrong.
**Closure (v8.1):** Specificity scoring with formula `trigger_conditions × severity_weight × statement_scope_weight`. Deterministic tie-break. Every decision logged to `outputs/reconciler-decisions.log`. See `reference/cross-layer-patterns.md` and `SKILL.md` Stage 5d.

### S1-2 — Voice-normalization rewrite-in-place
**Problem:** v8.0 overwrote subagent text. Audit reproducibility was destroyed. PROBABLE/POSSIBLE hedging was stripped, drifting confidence labels.
**Impact:** A reviewer reading the finding could not tell whether the text was the subagent's or a downstream paraphrase. Confidence-label-prose disagreement misled controllers.
**Closure (v8.1):** Annotation, not rewrite. Three-field provenance (`subagentRaw` / `voiceNormalized` / `controllerEdited`). Hedging preserved on PROBABLE/POSSIBLE. See `reference/voice-style-guide.md` and `SKILL.md` Stage 5g.

### S1-3 — 80% coverage threshold (silent-skip surface)
**Problem:** v8.0 allowed up to 20% of applicable ASC paragraphs to be skipped without explanation. A 20% silent-skip is large.
**Impact:** Coverage manifest readers could not tell which 20% was missed and why.
**Closure (v8.1):** 100% applicable rule. Every applicable ASC paragraph is either checked or skipped with a reason code from a finite enum. Coverage completeness = checked / (checked + not_checked_without_reason). See `SKILL.md` Stage 6.

### S1-4 — Missing citation discipline (L9 / L12)
**Problem:** L9 (Standards) findings sometimes lacked the ASC paragraph reference. L12 (Defense) findings sometimes lacked the regulatory citation.
**Impact:** Findings without citations were unreviewable — the reader could not assess the legal/standards basis.
**Closure (v8.1):** Schema-level rejection at Stage 5a. L9 findings missing `evidence.asc_reference` are rejected. L12 findings missing `evidence.regulatory_citation` OR with citations that don't resolve to `reference/regulatory-corpus/_index.json` are rejected. Citation discipline is invariant rule 13.

---

## Severity-2 items (6) — ALL CLOSED in v8.1

### S2-1 — Halt-vs-degrade ambiguity
**Problem:** v8.0 halted on missing soft-required inputs. Controllers wanted partial reviews with the gap visible.
**Closure:** v8.1 explicit halt-required = `fs_draft_pdf` only. Every other input degrades with a controller prompt. Invariant rule 15.

### S2-2 — No evergreen-accepted state
**Problem:** Boilerplate findings the controller knew were acceptable practice still escalated and counted against the readiness gate.
**Closure:** v8.1 `EVERGREEN_ACCEPTED` state. Skips escalation. Excluded from readiness count. Gold badge on dashboard. See `reference/prior-review-escalation.md`.

### S2-3 — Combined severity + coverage readiness gate
**Problem:** v8.0 readiness gate considered only severity. A review with 100% green severity but 50% coverage would have read READY.
**Closure:** v8.1 combined rule. READY requires zero unresolved CRITICAL/HIGH AND `coverage_completeness_pct ≥ 0.95`. Invariant rule 17.

### S2-4 — Structured location schema
**Problem:** v8.0 findings sometimes had a `location` field that was just a string. Filtering, sorting, and exporting were unreliable.
**Closure:** v8.1 structured `location` object — `statement`, `page`, `note_ref`, `line_id`, `column`, `xlsx_cell`. Schema rejects findings missing it. Invariant rule 2.

### S2-5 — Subagent SLAs and timeouts
**Problem:** v8.0 had no per-subagent timing. Slow subagents blocked reviews without surfacing the bottleneck.
**Closure:** v8.1 per-subagent SLA target + hard timeout, declared in each subagent SKILL.md frontmatter. Telemetry in coverage manifest. Timeout fires `subagents_failed` + red degradation chip.

### S2-6 — Version stamps for reproducibility
**Problem:** A finding from a prior review could re-fire or stop firing inexplicably after a reference doc change.
**Closure:** v8.1 every finding carries `subagent_version`, `prompt_version`, `reference_versions`. Schema rejects findings without them. Invariant rule 18.

---

## Severity-3 items — DEFERRED to post-migration

The council determined that the following items, while valuable, were not blocking v8.1 release. They are tracked for v8.2 / v9.0 sequencing.

- **S3-1 — Mechanical decomposition.** L1/L2/L4/L8 in a single subagent is dense. Decomposing into per-layer micro-agents would simplify prompts at the cost of more inter-agent coordination.
- **S3-2 — Phase 1 / Phase 2 restructure.** Comparative depends on Phase 1 findings; could be split further to allow parallel Comparative-prior-period and Comparative-multi-entity dispatch.
- **S3-3 — Framework-pluggable Standards.** Currently `reference/asc-matrices.md` is US GAAP / ASC 946. IFRS / Lux GAAP variants would benefit from a pluggable framework selector parameterized on `_FUND-METADATA.json`.
- **S3-4 — Deeper regulatory corpus.** Current keys cover the major rules; deeper coverage of edge cases (e.g., Cayman SIBA, EU AIFMD when applicable, Lux AIFMD, UK FCA) is wanted.
- **S3-5 — Full voice annotation reposition.** The voice annotation could also annotate `fix` against context-aware preparer registers (e.g., short-language for ops teams vs longer for general counsel reviews).

The Steward will revisit these at the quarterly aggregate review (per `OWNERSHIP.md`).

---

## Severity-4 items — ALL CLOSED in v8.1

### S4-1 — OWNERSHIP.md
Architect / Steward / Approver named; change-control gate matrix; quarterly aggregate review cadence; escalation contacts. See `OWNERSHIP.md`.

### S4-2 — Attribution footer survives PDF export
The dashboard and PDF export carry the line: *Architecture: Ashitosh Shinde · Apollo Mumbai Controllership · SHINE v8.1 · [build date]*. See `dashboard/render.md` and `dashboard/pdf-export.md`. Invariant rule 19.

### S4-3 — Council-review-v8.md
This document. The audit trail for the v8.0 → v8.1 increment.

### S4-4 — Schema rejection chip
Surface aggregate schema-rejection counts on the dashboard as a degradation chip. See `dashboard/render.md`.

### S4-5 — Discard-rate surveillance
Dashboard footer shows aggregate discard rate. If >20%, the controller is prompted for one-line attestation. Quarterly aggregate review covers this.

### S4-6 — Structured CFO summary block
Replaces v8.0's single-sentence narrative summary with a five-line loaded block. See `dashboard/render.md` §2.

### S4-7 — Reconciler decision log + constituent toggle
Every reconciler decision logged to `outputs/reconciler-decisions.log`. Dashboard "Show constituents" toggle exposes the audit trail; "Decouple this constituent" allows controller recovery.

---

## What the council did NOT change

- **The 14-layer model.** L1–L14 are stable from v7. Decomposition into 5 subagents is the v8 architecture; the layers themselves don't move.
- **Statement-grouping default.** v7 invariant. The "By Severity" toggle remains available.
- **Materiality framework.** v7 unchanged. Planning materiality 0.5%–1.0% of NAV; clearly trivial <5% of materiality.
- **Three-tier PDF export fallback.** v7 invariant. jsPDF → print popup → Blob.

---

## v8.1 release checklist

The council required all of the following items checked before v8.1 was released:

- [x] All Severity-1 items closed and re-tested on smoke-test fixture.
- [x] All Severity-2 items closed.
- [x] All Severity-4 items closed.
- [x] OWNERSHIP.md committed.
- [x] Attribution footer rendering verified across all 3 PDF export tiers.
- [x] Schema rejection chip verified on a synthetic schema-violation fixture.
- [x] Discard-rate prompt verified on a synthetic high-discard fixture.
- [x] Coverage 100% applicable rule verified — synthetic skip-without-reason fixture blocks READY.
- [x] Specificity-scored reconciler verified on a synthetic two-pattern-cluster fixture (specific pattern wins).
- [x] Evergreen state verified — synthetic LOW evergreen finding skips escalation and excludes from readiness.

The next council review is scheduled for the v8.2 / v9.0 sequencing decision after the first parallel-run quarter on v8.1.
