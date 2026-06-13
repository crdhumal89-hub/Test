# Lessons Learned — F-series (architecture) and V-series (rendering)

**Version:** 8.1.0
**Consumed by:** Steward training; Architect roadmap planning.

This file is the institutional memory. Each lesson captures a problem we hit, the root cause, and the architectural choice that closed it. New Stewards should read this file before making prompt or reference changes.

---

## F-1 — The monolithic-review problem (closed in v8.0)

**Symptom:** v7's single-prompt reviewer hit context-window pressure on funds with >150 line items. Findings dropped silently.

**Root cause:** All 14 layers in one prompt. The model couldn't hold everything.

**Resolution:** v8.0 decomposed into orchestrator + 5 specialist subagents. Each subagent owns a tightly scoped layer set and a tightly scoped reference corpus.

---

## F-2 — Statement-grouping vs severity-grouping (closed in v7)

**Symptom:** Severity-grouped dashboards forced the controller to mentally re-localize each finding ("HIGH severity in… which statement? which note?").

**Root cause:** Severity is a property of the finding; statement is a property of the document the controller is reviewing. The dashboard should match the document.

**Resolution:** `groupMode = "statement"` as default. By-Severity toggle remains available. Statement-group headers carry severity badges so the severity view is always one glance away.

---

## F-3 — Hidden-row flood (closed in v6.x, re-validated in v8.0 Mechanical)

**Symptom:** Reading XLSX workbook hidden rows generated 50+ false positives per review. Controllers ignored Mechanical findings.

**Root cause:** Hidden rows are mostly working-paper artifacts (scratch formulas, prior-year archive, formatting spacers).

**Resolution:** Two-tier hidden-row protocol. Mechanical classifies hidden rows and SUPPRESSES the noise classes. Only substantive overrides, substantive disagreements, and hidden VPM contradictions escalate to findings. The orchestrator should see 0–3 L8 findings per workbook on average.

---

## F-4 — The 80% coverage threshold gap (closed in v8.1)

**Symptom:** v8.0 declared "≥80% coverage" as the threshold. In practice, this meant 20% of applicable ASC paragraphs could be silently dropped without explanation.

**Root cause:** Coverage thresholds invite the silent-drop failure mode.

**Resolution:** v8.1 requires 100% applicable coverage. Every applicable ASC paragraph must be either checked or skipped with a reason code from a finite enum. Silent skips are forbidden.

---

## F-5 — Voice rewrite-in-place destroyed authorship (closed in v8.1)

**Symptom:** v8.0's voice normalization overwrote subagent text in place. Reviewers couldn't tell whether the finding language was the subagent's or a paraphrase.

**Root cause:** In-place rewrite is destructive to audit reproducibility.

**Resolution:** v8.1 annotates instead of rewrites. Three fields: `subagentRaw` (immutable), `voiceNormalized` (optional polish), `controllerEdited` (controller's words). Dashboard renders provenance triplet. PDF export shows it for Audit File mode.

---

## F-6 — Confidence-label drift from polish (closed in v8.1)

**Symptom:** Voice normalization stripped hedging from PROBABLE / POSSIBLE findings, making every finding read CERTAIN regardless of label.

**Root cause:** The polish pass applied to all findings uniformly.

**Resolution:** v8.1 voice annotation preserves hedging on PROBABLE / POSSIBLE; polishes CERTAIN only. See `reference/voice-style-guide.md`.

---

## F-7 — First-match-wins reconciler missed better matches (closed in v8.1)

**Symptom:** A generic pattern listed before a specific pattern would capture a cluster the specific pattern was designed for. Root cause was wrong.

**Root cause:** First-match-wins is order-dependent; humans add patterns in the order they think of them, not in specificity order.

**Resolution:** v8.1 specificity scoring. All patterns evaluated, scored, highest wins. Tie-breaks deterministic. Every decision logged.

---

## F-8 — Halt vs degrade ambiguity (closed in v8.1)

**Symptom:** v8.0 halted on missing soft-required inputs. Controllers wanted to run the review anyway, with the missing input flagged. Halts blocked productive partial reviews.

**Root cause:** The halt-required vs soft-required distinction was implicit.

**Resolution:** v8.1 explicit halt-vs-degrade discipline. Only `fs_draft_pdf` is halt-required. Every other input is degradation-eligible with a controller prompt ("Run anyway? Yes / Get the file first").

---

## F-9 — Evergreen findings inflate the readiness count (closed in v8.1)

**Symptom:** Boilerplate findings the controller persistently accepts year-over-year still counted against readiness. READY required perpetual re-Discarding.

**Root cause:** No state for "accepted as documented practice".

**Resolution:** v8.1 `EVERGREEN_ACCEPTED` state. Controller marks a finding evergreen; it skips escalation and excludes from the readiness count. Drift detection at quarterly aggregate review.

---

## F-10 — Coverage manifest without citation gates (closed in v8.1)

**Symptom:** L9 / L12 findings sometimes lacked the ASC paragraph or regulatory citation. Reviewer had to ask "where does this come from?"

**Root cause:** No schema-level enforcement.

**Resolution:** v8.1 schema rejects L9 findings missing `evidence.asc_reference` and L12 findings missing (or with unresolvable) `evidence.regulatory_citation`. Citation discipline is invariant rule 13.

---

## F-11 — No SLA on subagents (closed in v8.1)

**Symptom:** Slow subagent runs blocked the entire review without surfacing the bottleneck.

**Root cause:** No timing telemetry, no per-subagent timeout.

**Resolution:** v8.1 per-subagent SLA target + hard timeout. Telemetry in `coverage-manifest.json`. Timeout fires `subagents_failed` with a red degradation chip.

---

## F-12 — Reproducibility lost when references changed (closed in v8.1)

**Symptom:** A finding from a prior review would re-fire (or stop firing) inexplicably after a reference doc change. No way to reconstruct what version of the matrices the prior finding came from.

**Root cause:** No version stamps on findings.

**Resolution:** v8.1 every finding carries `subagent_version`, `prompt_version`, and `reference_versions`. The reference_versions map records the consulted reference docs and their version tags. Stage 5a rejects findings missing version stamps.

---

## V-1 — Wrong fund name in cover page slipped through (closed in v7)

**Symptom:** A v6.x review missed a cover-page fund-name mismatch with metadata (legal name typo). The auditor caught it later.

**Root cause:** Cover page wasn't explicitly verified.

**Resolution:** Stage 2 entity verification. Cover-page legal name, domicile, period, presentation are compared to `_FUND-METADATA.json` character-for-character. Mismatch is a P1 CRITICAL finding.

---

## V-2 — Inline edits were lost on page refresh (closed in v6.x, validated in v8.1)

**Symptom:** Controller edits to finding text were lost on reload.

**Root cause:** State held in DOM, not persisted.

**Resolution:** localStorage persistence keyed by `review_id`. Edits, dispositions, undo stack all persisted. Reload-safe.

---

## V-3 — PDF export failed in restricted browser configurations (closed in v6.x)

**Symptom:** Controllers on locked-down corporate browsers couldn't export to PDF.

**Root cause:** Single-tier reliance on a specific library or popup permission.

**Resolution:** 3-tier fallback. jsPDF → print popup → Blob download. Tier 3 always works.

---

## V-4 — Ctrl+Z bug exposed a stale undo stack (closed in v6.x)

**Symptom:** Undo restored a state from two actions ago, not the most recent.

**Root cause:** Stack pushed AFTER the action mutated state, not before.

**Resolution:** Push prior state to undo stack BEFORE applying any mutation. Max depth 20. Stack persisted in localStorage.

---

## V-5 — Severity grouping inflated the "many findings" visual signal (closed in v7)

**Symptom:** A severity-grouped view of 20 LOW findings dominated the visual real estate, distracting from 2 CRITICAL findings.

**Root cause:** Visual weight followed group cardinality, not severity.

**Resolution:** Statement-group default. Severity is a chip on each card; group headers show severity counts. Visual weight reflects document, not noise.

---

## V-6 — Attribution footer didn't survive PDF export in some browsers (closed in v8.1)

**Symptom:** Print popup mode (Tier 2) sometimes dropped the footer in WebKit.

**Root cause:** `@page` footer rule applied inconsistently across browsers.

**Resolution:** v8.1 attribution footer is rendered both as a `@page @bottom-center` rule AND as a static block at the end of the document. Belt-and-suspenders.

---

## V-7 — Constituents toggle revealed reconciler over-collapses (caught in v8.0 production)

**Symptom:** Controllers found that the reconciler sometimes collapsed unrelated findings into a single root cause.

**Root cause:** First-match-wins pattern selection (F-7).

**Resolution:** F-7 closure (specificity scoring) plus dashboard "Show constituents" toggle (v8.0 polish) plus "Decouple this constituent" action (v8.1). Reconciler over-collapses are now controller-recoverable.

---

## V-8 — Unicode escape sequences leaked into the rendered HTML (closed in v7)

**Symptom:** Some non-ASCII characters rendered as `á` instead of the actual character.

**Root cause:** Python source generated escape sequences instead of writing UTF-8 directly.

**Resolution:** Invariant rule 12. Stage 7 grep check for `\\u[0-9a-fA-F]{4}` patterns — any match halts and regenerates.

---

## V-9 — F-14 / V-9 smoke tests added (closed in v7)

**Symptom:** Subtle render bugs slipped past the orchestrator's validation.

**Root cause:** Validation was syntactic (Rule 7 Node syntax check), not semantic.

**Resolution:** v7 added two smoke tests:
- F-14: a synthetic CRITICAL/CERTAIN finding seeded into the test fixture must appear on the dashboard.
- V-9: the rendered dashboard must contain the literal phrase "READY" in exactly one banner element.

Both run during Stage 7 validation on every render.

---

## V-10 — Schema rejection chip added (v8.1)

**Symptom:** Schema-validated rejections at Stage 5a were silent — controllers didn't know findings were being dropped.

**Root cause:** No surfacing of the silent-loss surface.

**Resolution:** v8.1 surface rejection counts as a degradation chip on the dashboard. Per-subagent counts >5% trigger a quarterly review flag.

---

## V-11 — Discard-rate surveillance (v8.1)

**Symptom:** A small number of reviews had >50% discard rates — possibly indicating subagent noise OR controller signal-blindness.

**Root cause:** No telemetry.

**Resolution:** v8.1 footer shows aggregate discard rate. If >20%, the controller is prompted for one-line attestation on each discard. Quarterly aggregate review covers this.

---

## How to add a lesson

Steward workflow per `OWNERSHIP.md`:
1. Open a `[polish]` PR.
2. Add the next sequential F-NN or V-NN with: symptom, root cause, resolution.
3. Reference the prior review that surfaced the symptom (anonymized).
4. Merge after Steward self-review. Architect notification only if the lesson identifies an invariant gap (in which case the PR is `[invariant]`, not `[polish]`).
