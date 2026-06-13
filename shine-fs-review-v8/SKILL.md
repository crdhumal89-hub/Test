---
name: shine-fs-review
description: "SHINE v8.1 — Statement Health Intelligence & Notation Engine. Orchestrator skill for ASC 946 fund FS review. Dispatches 5 specialist subagents (Mechanical, Narrative, Standards, Comparative, Defense) covering 14 review layers in 3 gates. Reads inputs from Box manifest, aggregates findings via specificity-scored cross-layer reconciler, applies prior-review escalation with evergreen-accepted state, voice-annotates (does not rewrite), validates 100% applicable coverage, and renders v7 statement-grouped dashboard with disposition cycle, structured CFO summary, and dual PDF export. Fund-agnostic. Review. Refine. Ready."
license: Proprietary — Internal use only
version: 8.1
architect: Ashitosh Shinde — Apollo Mumbai Controllership (see OWNERSHIP.md)
---

# SHINE v8.1 — Orchestrator
## Statement Health Intelligence & Notation Engine
### Review. Refine. Ready.

> **v8.1 council remediation.** This version implements the four pre-parallel-run Severity-1 items, all six Severity-2 items, and the Severity-4 governance/polish items from `docs/council-review-v8.md`. Severity-3 items (Mechanical decomposition, Phase 1/2 restructure, framework-pluggable Standards, deeper regulatory corpus, full voice annotation reposition) are scheduled post-migration per the council's own priority sequencing.

> **What this skill is:** A controller-facing orchestrator that dispatches five specialist subagents, merges their findings under v7 statement-grouped semantics, applies prior-review escalation, and renders the review dashboard. The orchestrator does not perform review itself — it coordinates.
>
> **What this skill is NOT:** A monolithic reviewer. The 14 review layers live in `subagents/`. The ASC matrices live in `reference/`. The dashboard rendering rules live in `dashboard/`. This file is a dispatcher and merge engine.

---

## When to invoke

Trigger this skill whenever the controller (or an authorized delegate) asks to review a fund's draft financial statements. Recognized triggers include: "SHINE this draft," "review [fund] FS," "run SHINE on [Box path]," "FS review," "ASC 946 compliance check," "audit readiness assessment," "compare current vs prior draft." Also trigger when the user uploads a draft FS document and asks for review.

The skill is **fund-agnostic**. Do NOT hardcode fund-specific assumptions. Read fund identity from `_FUND-METADATA.json` and review-specific inputs from `_REVIEW-MANIFEST.json`.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR (this file)                         │
│                                                                       │
│  Intake → Identify → Dispatch → Aggregate → Reconcile → Render       │
└───────────┬───────────────────────────────────────┬───────────────────┘
            │                                       │
            ▼                                       ▼
┌──────────────────────────────────┐   ┌──────────────────────────────┐
│      PHASE 1 — PARALLEL          │   │   PHASE 2 — POST PHASE 1     │
│  (no causal dependency)          │   │   (uses Phase 1 outputs)     │
│                                  │   │                              │
│  ▸ Mechanical   (L1, L2, L4, L8) │   │  ▸ Comparative  (L10, L11)   │
│  ▸ Narrative    (L3, L5, L6, L7) │   │  ▸ Defense      (L12,L13,L14)│
│  ▸ Standards    (L9)             │   │                              │
└──────────────────────────────────┘   └──────────────────────────────┘
```

Subagents live in `subagents/`. Each is invoked via the Task tool with a tightly scoped prompt + the relevant input files + its reference corpus. Subagents return a `findings.json` conforming to `manifests/finding-schema.json` and a `coverage-manifest.json` declaring what was checked and what was skipped.

---

## Stage-by-stage protocol

### STAGE 1 — Intake (T+0)

The controller invokes the skill with one of:
- A Box path to a draft folder (e.g., `/AAA-Fund-Reviews/AAA-COINV-A/2025-FY/Draft-1.1/`)
- Uploaded files in the conversation (legacy path; orchestrator constructs an inline manifest)

**Read first, in this order:**
1. `<draft-folder>/inputs/_REVIEW-MANIFEST.json` — authoritative input list.
2. `<fund-folder>/_FUND-METADATA.json` — static fund facts.
3. `_LIBRARY/_LIBRARY-MANIFEST.json` — Tier-1 references available.

**Halt-vs-degrade discipline (v8.1):** The orchestrator distinguishes two classes of required input.

- **Halt-required (correctness-blocking):** `fs_draft_pdf` only. Without the FS PDF, no review is possible. Missing → HALT and ask the controller.
- **Soft-required (degradation-eligible):** every other `required: true` input (consolidation memo, LPA, prior FS, workbook, sibling FS). Missing → enter degraded mode for the affected subagent(s), emit a red degradation chip, and prompt the controller via a single message: "Run anyway? (Yes / Get the file first)". On Yes, proceed; on Get-the-file, halt. NEVER halt silently on a soft-required input.

If `_REVIEW-MANIFEST.json` itself is missing or unparseable, HALT and ask the controller to populate it. This is the only manifest-level halt; everything else is degradation-eligible.

**Build the review brief.** A short object the orchestrator carries through the rest of the run:
```json
{
  "review_id": "<from manifest>",
  "fund_code": "<from metadata>",
  "fund_legal_name": "<from metadata>",
  "domicile": "<from metadata>",
  "structure_type": "<from metadata>",
  "period": "<from manifest>",
  "draft": "<from manifest>",
  "fiscal_year_end": "<from metadata>",
  "regulatory_jurisdictions": ["<from metadata>"],
  "presentation": "<from metadata>",
  "materiality_planning_pct": "<from metadata>",
  "inputs_present": [...],
  "inputs_absent": [...],
  "degradation_chips": [...]
}
```

### STAGE 2 — Entity verification (T+1)

Open `fs_draft_pdf` cover page and verify against `_FUND-METADATA.json`:
- Legal name character-for-character match.
- Domicile match.
- Period end date match to manifest.
- Presentation header consistency with metadata.

Any mismatch is logged as a P1 finding (CRITICAL/CERTAIN, Cover statement) and surfaces in Stage 5 aggregation. Do NOT halt the review — proceed. The controller decides whether the cover page or the metadata file is wrong.

### STAGE 3 — Phase 1 parallel dispatch (T+2)

Dispatch three subagents concurrently using the Task tool. Each subagent receives:
- The review brief (Stage 1)
- The specific input files it owns (per `_REVIEW-MANIFEST.json`)
- Its own reference corpus
- Its persona prompt (the subagent SKILL.md)
- The finding schema

**Concurrency:** All three Task tool invocations MUST go in a single message with multiple tool calls. Sequential dispatch defeats the entire architecture.

| Subagent | Layers | Inputs received | Reference corpus |
|---|---|---|---|
| **Mechanical** | L1, L2, L4, L8 | `fs_draft_pdf`, `fs_workbook_xlsx`, `consolidation_memo`, `policy_memos` | `_LIBRARY/templates/`, `reference/vpm-security-mapping.md` |
| **Narrative** | L3, L5, L6, L7 | `fs_draft_pdf`, `lpa_or_fee_summary` | `_LIBRARY/note_libraries/` |
| **Standards** | L9 | `fs_draft_pdf` | `reference/asc-matrices.md` |

### STAGE 4 — Phase 2 parallel dispatch (T+3)

After ALL three Phase 1 subagents return, dispatch the remaining two concurrently:

| Subagent | Layers | Inputs received | Reference corpus |
|---|---|---|---|
| **Comparative** | L10, L11 | `fs_draft_pdf`, `prior_fs_pdf`, `consolidation_memo`, `sibling_entity_fs`, Phase 1 findings | `reference/consolidation-decision-tree.md` |
| **Defense** | L12, L13, L14 | `fs_draft_pdf`, fund metadata (jurisdictions, regulatory refs) | none — uses subagent's embedded knowledge |

Comparative MAY consume Phase 1 findings as context — e.g., a Standards finding about new ASU adoption tells Comparative to look harder for COMP-5 transition disclosure.

### STAGE 5 — Aggregation (T+4)

Collect all returned `findings.json` and `coverage-manifest.json` files. Then:

**5a. Validate every finding against `manifests/finding-schema.json` (v8.1 schema).** Reject any finding missing required fields. The v8.1 schema-validation rejection rules:
- Missing `section`, `sortOrder`, `statement`, `subagentRaw`, or `fix` → reject.
- Missing structured `location` object OR missing `location.statement` → reject.
- Missing `subagent_version`, `prompt_version`, or `reference_versions` → reject.
- L9 finding missing `evidence.asc_reference` → reject (Standards must cite the paragraph).
- L12 finding missing `evidence.regulatory_citation` → reject (Defense must cite the regulatory corpus key per v8.1 citation discipline).
- L12 finding with `evidence.regulatory_citation` that does not exist in `reference/regulatory-corpus/` → reject (orchestrator validates citation key against corpus files).

For rejected findings, log to `outputs/rejected-findings.log` with the violating subagent, finding payload, and reason code. The dashboard surfaces aggregate rejection counts as a degradation chip ("N findings rejected at schema validation, see log") so the controller sees the silent-loss surface.

If a subagent's rejection rate exceeds 5% on a single review, flag for re-prompting at end of run.

**5b. Assign `id` field.** Format `F-001`, `F-002`, ... in insertion order. Stable across re-runs only if input set is identical.

**5c. Compute `merge_key` for every finding.** Format: `<statement>::<section>::<line_id_or_norm>::<finding_class>`. Where:
- `line_id_or_norm` is the specific line item or, if a multi-line finding, a normalized section reference.
- `finding_class` is a coarse classification: `tie_out_break`, `template_deviation`, `disclosure_gap`, `language_error`, `forensic_ghost`, `asc_mapping_gap`, `comparative_movement`, `inter_entity_break`, `regulatory_gap`, `valuation_governance`, `audit_defense`, `formatting`.

**5d. Apply cross-layer pattern reconciler (v8.1 specificity scoring).** Load `reference/cross-layer-patterns.md`. The v8.1 selection algorithm evaluates ALL patterns against the finding population, computes specificity scores per pattern per cluster, and selects the highest-scoring match. The v8.0 "first match wins" rule is removed.

Process:
1. Compute clusters of findings sharing `merge_key` prefixes (statement + section) or explicit cross-references.
2. For each cluster, evaluate every pattern's trigger set. Patterns with all triggers met enter the candidate set.
3. Score each candidate per the formula in the patterns file: `trigger_conditions × severity_weight × statement_scope_weight`.
4. Select the highest-scoring pattern. Tie-break: more trigger conditions, then higher severity floor, then lower pattern number (deterministic).
5. Collapse matched findings into ONE root-cause finding. Preserve the constituent finding IDs in the root cause's `constituent_findings` array (dashboard exposes via "Show constituents" toggle).
6. Tag the root cause with `reconciler_pattern` (the pattern name) and `reconciler_specificity_score`.
7. Write the full decision trace to `outputs/reconciler-decisions.log`: cluster, all candidate scores, winner, and consumed finding IDs. This is the audit trail for every collapse.

A single constituent can be consumed by at most one root cause. Once consumed, it is removed from the candidate set for subsequent cluster evaluation.

**5e. Dedup by `merge_key`.** Findings sharing a `merge_key` after pattern reconciliation are candidate duplicates. Apply this rule:
- If same `subagent` AND same `merge_key` → keep one (highest severity), discard others, log to `outputs/dedup.log`.
- If different `subagent` AND same `merge_key` AND not collapsed by pattern reconciler → keep both but cross-reference (each finding's `detail` notes the sibling finding ID).

**5f. Apply prior-review escalation (v8.1 with EVERGREEN_ACCEPTED support).** If `prior_review_output` exists in manifest, for each current finding:
- Look up by `merge_key` in prior findings.
- **EVERGREEN CHECK FIRST (v8.1):** If matched prior finding had `evergreen_accepted: true`, set `prior_review_recurrence = "EVERGREEN_ACCEPTED"`, carry forward `evergreen_acceptance_reason` and `_date`, and SKIP the severity escalation step. Do NOT count this finding toward the readiness gate. The dashboard still displays it with an "Evergreen" badge.
- If found in prior with state OPEN/ACCEPTED → set `prior_review_recurrence = "RECURRING"` and escalate severity per `reference/prior-review-escalation.md`.
- If found in prior with state RESOLVED → set `prior_review_recurrence = "REGRESSED"` and escalate one above current.
- If not found → `prior_review_recurrence = "NEW"`.
- For prior findings absent from current → emit a synthetic "RESOLVED" entry for the dashboard's resolved-view audit trail.

Log every escalation decision (including evergreen-skip decisions) to `outputs/escalation-decisions.log`.

**5g. Voice annotation (v8.1 — replaces v8.0 rewrite).** Run every finding through the annotation rules in `reference/voice-style-guide.md`. The orchestrator does NOT overwrite `subagentRaw`; it populates `voiceNormalized` if a polish is warranted, otherwise leaves it null. The same logic applies to `fix` via `fixSubagentRaw` → `fixVoiceNormalized`.

Annotation rules:
- Preserve hedging on PROBABLE and POSSIBLE findings (faithful to confidence).
- Polish CERTAIN findings to remove hedging only.
- Skip findings already clean (set `voiceNormalized = null`).

The dashboard displays `subagentRaw` by default with a "polished available" indicator when `voiceNormalized` exists. Controller chooses which version flows to the preparer/audit export.

If a subagent CONSISTENTLY produces text that needs polishing on more than 30% of its findings, flag for prompt-tuning at end of run.

**5h. Sort by FS page order.** Within each statement group, sort by `sortOrder`. Across groups, follow `statement-groups.json` `fs_page_order`.

### STAGE 6 — Coverage roll-up (T+5) — v8.1 100% applicable model

Merge all subagent `coverage-manifest.json` outputs into a single `outputs/coverage-manifest.json`:
```json
{
  "review_id": "...",
  "subagents_completed": [...],
  "subagents_failed": [...],
  "subagents_skipped": [...],
  "layers_covered": ["L1", "L2", ...],
  "layers_skipped": [{"layer": "L8", "reason_code": "NO_WORKBOOK", "reason": "No Excel workbook in manifest"}],
  "asc_paragraphs_applicable": [...],
  "asc_paragraphs_checked": [...],
  "asc_paragraphs_not_checked": [{"paragraph": "ASC 815-10-50-4D", "reason_code": "NOT_APPLICABLE", "reason": "No derivatives on BS or in SOI"}],
  "coverage_completeness_pct": 0.96,
  "regulatory_citations_referenced": ["CIMA:MFA-4", "SEC:RULE-206-4-2"],
  "regulatory_corpus_attestation_age_days": {"CIMA": 14, "SEC": 14},
  "subagent_elapsed_seconds": {"mechanical": 142, "narrative": 98, ...},
  "subagent_timeouts_fired": [],
  "schema_rejections": {"total": 0, "by_subagent": {}},
  "controller_discard_rate_observed": null,
  "degradation_chips": [...]
}
```

**v8.1 coverage rule (replaces v8.0 80% threshold):**
- Every applicable ASC paragraph MUST be either checked OR explicitly skipped with a reason code.
- Coverage completeness % = checked / (checked + not_checked_with_no_reason). Always 100% if every skip has a reason; less than 100% if any skip lacks a reason (which is itself a control gap).
- Controller escalation trigger: ANY ASC paragraph skipped without a reason code, OR coverage completeness < 100%, OR any subagent timed out, OR regulatory corpus attestation older than 6 months for any jurisdiction in scope.

This file is the audit-trail answer to "did we check everything?" The controller surfaces it for Deloitte review.

### STAGE 7 — Dashboard render (T+6)

Load `dashboard/render.md` and follow it precisely. Inputs to the render:
- `outputs/findings.json` (the merged, deduped, escalated, voice-annotated finding set)
- `outputs/coverage-manifest.json` (for degradation chips + coverage completeness)
- `outputs/reconciler-decisions.log` (for the "Show constituents" reconciler trace)
- The review brief (for header)
- `manifests/statement-groups.json` (for group labels and section notes)

**Default groupMode = "statement"** per v7. Group by statement in FS page order. STATEMENT_GROUPS metadata renders as group headers with full label + severity badges + count + italic section note.

**v8.1 render additions (per `dashboard/render.md`):**
- **Structured CFO summary block** at top: five loaded lines (entity, materiality, finding-population disposition, coverage completeness, residual risk class). Replaces v8.0's single-sentence narrative.
- **Combined readiness rule:** READY requires zero unresolved CRITICAL/HIGH AND coverage_completeness ≥ 95%. READY WITH EXCEPTIONS requires only MEDIUM/LOW residual AND coverage ≥ 85%. NOT READY otherwise.
- **Provenance display:** finding cards show `subagentRaw` by default. When `voiceNormalized` exists, a "polished available" indicator appears; clicking reveals both side by side. When `controllerEdited` is set, dashboard shows the edited version with "(edited)" badge AND hover preserves the original via tooltip.
- **Constituents toggle:** every root-cause finding (`reconciler_pattern` is non-null) shows a "Show constituents" toggle. Reveals the constituent findings with original subagent attribution and the ability to decouple a constituent.
- **Evergreen badge:** findings with `prior_review_recurrence == "EVERGREEN_ACCEPTED"` display a subtle gold "Evergreen" badge. Tooltip shows acceptance reason and date.
- **Discard-rate surveillance:** dashboard footer shows aggregate discard rate. If > 20%, prompt the controller to attest discards.
- **Schema rejection chip:** if `outputs/rejected-findings.log` is non-empty, surface a degradation chip ("N findings rejected at schema validation").
- **Attribution footer (Severity-4):** every dashboard rendering includes a footer line that survives PDF export: "Architecture: Ashitosh Shinde · Apollo Mumbai Controllership · SHINE v8.1 · [build date]".

**Validate before delivery** per Rule 7 (Node syntax check) and Rule 8 (unicode escape grep). See `dashboard/render.md`.

### STAGE 8 — Disposition cycle (T+7+, controller-driven)

The controller dispositions findings via the dashboard UI: Accept / Discard / Resolve / Reopen / Undo. The dashboard owns this loop. Each action pushes to the undo stack (max 20 entries). Ctrl+Z reverts.

### STAGE 9 — Export (T+ on demand)

Two modes per `dashboard/pdf-export.md`:
- **Preparer Export** — OPEN + ACCEPTED only, statement-grouped, sent to fund administrator.
- **Audit File Export** — ACCEPTED + RESOLVED with notes, statement-grouped, for audit file.

Both exclude DISCARDED. Both group by statement in FS page order (v7 absolute rule).

---

## v7 / v8 / v8.1 Absolute Rules (Invariants)

These rules MUST hold across every review. If a subagent returns output that violates any rule, the orchestrator rejects and re-prompts.

1. **Statement grouping is the default.** `groupMode = "statement"` on dashboard load. The "By Severity" toggle is available but not default.
2. **Every finding has `section`, `sortOrder`, AND structured `location` (v8.1).** No exceptions. Findings without these are rejected at Stage 5a.
3. **STATEMENT_GROUPS metadata is present.** Loaded from `manifests/statement-groups.json`. Group headers render with full label, severity badges, count, italic section note.
4. **PDF export is statement-grouped.** FS page order. Gold-tinted statement header rows as section dividers. NOT severity-sorted.
5. **Fund-agnostic execution.** Orchestrator references `_FUND-METADATA.json` for fund identity. NEVER hardcodes fund-specific behaviour in this file or in subagent files.
6. **Inputs come from manifest.** Orchestrator reads `_REVIEW-MANIFEST.json` as the single source of truth. NEVER infers files from directory listing alone.
7. **Coverage is explicit AND 100% applicable (v8.1).** Every layer skipped AND every applicable ASC paragraph skipped emits a reason code and a coverage-manifest entry. Silent skips are forbidden. Skips without reason codes count as control gaps.
8. **Subagent failure does not silently degrade output.** SLA timeouts mark `subagents_failed`/`layers_skipped`, emit red degradation chip, controller-facing warning in CFO summary.
9. **Inline edit preserved with canonical provenance (v8.1).** Three fields: `subagentRaw` (immutable original), `voiceNormalized` (annotation, never overwrites raw), `controllerEdited` (controller's words). Undo stack covers edits.
10. **3-tier PDF export fallback.** jsPDF → print popup → Blob. See `dashboard/pdf-export.md`.
11. **Voice annotation (v8.1 — replaces v8.0 rewrite).** Original is preserved; polish is optional and controller-selected. No silent rewrite.
12. **Unicode characters direct.** UTF-8 source. NEVER Python double-backslash unicode escapes. Post-generation grep check.
13. **Citations mandatory for L9 and L12 (v8.1).** L9 findings cite ASC paragraph. L12 findings cite regulatory corpus key. Stage 5a rejects findings missing required citations.
14. **Specificity-scored reconciler (v8.1).** Pattern selection is highest-specificity, not first-match. Every decision logged to `reconciler-decisions.log`.
15. **Halt vs degrade discipline (v8.1).** Only `fs_draft_pdf` is halt-required. All other inputs degrade with controller prompt.
16. **Evergreen-accepted state (v8.1).** Controller can mark LOW/MEDIUM recurring findings as acceptable practice. Skips escalation, excluded from readiness gate count.
17. **Combined readiness gate (v8.1).** READY requires both clean severity AND coverage_completeness ≥ 95%.
18. **Version stamps mandatory on every finding (v8.1).** `subagent_version`, `prompt_version`, `reference_versions`. Audit trail reproducibility.
19. **Attribution preserved end-to-end (v8.1).** Dashboard footer carries the architect attribution line across PDF export.
20. **Governance roles named.** Per `OWNERSHIP.md`, Architect / Steward / Approver workflow applies to every change.

---

## Severity classification (unchanged from v7)

**Impact:** CRITICAL (audit qualification / regulatory breach / material misstatement), HIGH (material presentation error informed reader notices), MEDIUM (disclosure gap), LOW (cosmetic).

**Confidence:** CERTAIN (mathematically provable), PROBABLE (strong evidence needs confirmation), POSSIBLE (pattern-based suspicion warrants controller question).

Subagents assign initial severity. Orchestrator may escalate per `reference/prior-review-escalation.md`. Orchestrator does NOT downgrade subagent-assigned severity — only the controller's disposition can effectively reduce severity by Discarding.

---

## Materiality framework (unchanged from v7)

| Benchmark | Materiality (Planning) | Clearly Trivial |
|---|---|---|
| Partners' Capital / NAV | 0.5%–1.0% of total NAV | <5% of materiality |
| Total Investment Income | 3%–5% | <5% of materiality |
| Management Fees | Lower of 5% of fees or $50K | <$5K |

Rounding tolerance: individual line ±$1; totals must foot exactly. Qualitative materiality (wrong entity name, wrong year, wrong domicile, unresolved placeholders) is ALWAYS CRITICAL regardless of dollar impact.

---

## Readiness gate (v8.1 combined rule)

The dashboard banner shows one of three states, computed from BOTH severity disposition AND coverage completeness:

- **NOT READY (red)** — ANY of: unresolved CRITICAL or HIGH (OPEN or ACCEPTED, excluding EVERGREEN_ACCEPTED); coverage_completeness < 85%; any subagent timeout fired with critical layers skipped; any regulatory corpus older than 6 months for an applicable jurisdiction.
- **READY WITH EXCEPTIONS (amber)** — only MEDIUM/LOW residual AND coverage_completeness between 85% and 95%.
- **READY (green)** — all CRITICAL/HIGH resolved or discarded (or evergreen), and coverage_completeness ≥ 95%.

The banner narrative additionally surfaces:
- Coverage % and any layer skipped without reason.
- Controller discard rate (transparency for downstream readers).
- Synthetic-resolved count (priors that cleared).
- Evergreen count (priors that the controller accepts as documented practice).

Orchestrator computes the readiness state from final finding set + coverage manifest after Stage 6. Renders in Stage 7.

---

## Failure modes the orchestrator MUST guard against (v8.1)

| Failure | Detection | Response |
|---|---|---|
| Subagent returns malformed JSON | Parse fails | Re-prompt subagent with schema reminder; if still failing, mark subagent_failed |
| Subagent finding missing required v8.1 fields (`section`, `sortOrder`, `location`, version stamps, mandated citations) | Stage 5a validation | Reject finding, log, re-prompt subagent. Surface aggregate via degradation chip. Flag subagent if rejection rate > 5%. |
| L9 finding missing `evidence.asc_reference` | Stage 5a validation | Reject. Standards must cite the paragraph. |
| L12 finding missing `evidence.regulatory_citation` OR citation not found in regulatory corpus | Stage 5a validation | Reject. Defense must cite the corpus. |
| Two subagents flag the same line-item from different angles | Stage 5d specificity-scored reconciler | Highest-specificity pattern collapses to root cause; decision logged. If no pattern matches, cross-reference both. |
| Subagent claims to have checked something it didn't (false positive coverage) | Cross-check coverage-manifest against finding count and against checks_run counts | Surface as orange degradation chip with explicit subagent name and skipped scope. |
| Hidden Excel rows produce false positive flood | Mechanical subagent's XLSX two-tier protocol | Mechanical handles internally; orchestrator does NOT see the noise. |
| Cover page mismatches fund metadata | Stage 2 verification | Emit P1 CRITICAL finding, do NOT halt, let controller decide source of truth. |
| `fs_draft_pdf` missing | Stage 1 manifest read | HALT, ask controller. The only halt-required input. |
| Soft-required input missing | Stage 1 manifest read | Degraded mode + chip + controller prompt ("Run anyway? Yes / Get the file first"). NEVER silent. |
| Subagent SLA timeout (v8.1) | Per-subagent target/timeout in subagent SLA tables | Mark `subagents_failed` for the affected layers, emit red degradation chip, continue with remaining subagents. |
| Regulatory corpus attestation > 6 months | Stage 6 coverage roll-up | Emit degradation chip per jurisdiction. NOT READY if any applicable jurisdiction. |
| Coverage < 100% applicable without reason codes | Stage 6 coverage roll-up | Flag as control gap. Block READY verdict. |
| Reconciler over-collapses (controller disputes) | Dashboard "Show constituents" toggle + decouple | Controller decouples constituent; root cause updates; logged in escalation log. |
| Controller discard rate > 20% on a review | Dashboard footer surveillance | Prompt controller for one-line attestation per discard. Logged. Quarterly aggregate. |
| Dashboard JS syntax error | Stage 7 Node validate | HALT before delivery, regenerate. |
| Unicode escape sequence leaked into output | Stage 7 grep check | HALT before delivery, regenerate. |

---

## Controller escalation triggers (v8.1)

Notify the controller (ashinde@apollo.com per `OWNERSHIP.md`) outside the normal dashboard render in these cases:
- Any CRITICAL/CERTAIN finding that is also RECURRING from prior review (control failure signal). Excludes EVERGREEN_ACCEPTED.
- Subagent failure (any layer dropped) OR subagent SLA timeout fired.
- Cover page mismatch.
- Subsequent events not addressed in FS draft when fund metadata indicates events occurred (e.g., investment period expired).
- **Coverage completeness < 100% applicable** (v8.1 — replaces 80% threshold). Specifically: any ASC paragraph skipped without reason code, OR coverage_completeness < 95%.
- Regulatory corpus older than 6 months for any applicable jurisdiction.
- Controller discard rate > 20% on the current review (signals noise or hidden issues).
- Schema rejection rate > 5% for any subagent (signals subagent quality degradation).
- Reconciler over-collapse observed in production (any decoupling action in dashboard).

Default notification mechanism: in-dashboard red banner + structured CFO summary callout. Email notification is OPTIONAL and controller-configured. Quarterly aggregate review per `OWNERSHIP.md`.

---

## Reference document loading

Load lazily. The orchestrator does NOT load reference docs into its own context unless it needs them for its own work (e.g., `cross-layer-patterns.md` in Stage 5d, `prior-review-escalation.md` in Stage 5f, `voice-style-guide.md` in Stage 5g, `statement-groups.json` in Stage 7). Subagents receive references via the Task tool prompt — they don't share orchestrator context.

---

## Output protocol summary (v8.1)

By the end of a successful run, the following files exist in `<draft-folder>/outputs/`:
- `dashboard.html` — interactive review dashboard with structured CFO summary, provenance display, "Show constituents" toggle, evergreen badges, discard-rate surveillance, schema-rejection chip, attribution footer.
- `findings.json` — merged finding set conforming to schema v8.1 (three-field provenance, structured location, version stamps).
- `coverage-manifest.json` — 100% applicable coverage trace, ASC paragraphs checked/not-checked-with-reason, regulatory citations referenced, subagent SLA telemetry, schema rejection counts.
- `rejected-findings.log` — findings rejected at Stage 5a with subagent and reason code.
- `reconciler-decisions.log` — every cluster's pattern scores + winner + consumed IDs.
- `escalation-decisions.log` — every escalation decision including evergreen-skips.
- `dedup.log` — findings deduped at Stage 5e.
- On demand: `preparer-export.pdf` (controller-edited language, OPEN + ACCEPTED, simplified readiness summary for preparer prioritization), `audit-file-export.pdf` (ACCEPTED + RESOLVED + provenance chain visible, evergreen section, full readiness banner).

The dashboard is the controller's primary interface. The JSON and log files are the audit-trail substrate. The PDFs are the external deliverables.

---

## What this skill explicitly does NOT do

- Does not perform review itself — subagents do.
- Does not contain ASC matrices — `reference/asc-matrices.md` does.
- Does not contain dashboard HTML/CSS/JS — `dashboard/render.md` does.
- Does not contain PDF export logic — `dashboard/pdf-export.md` does.
- Does not contain the lessons-learned F1–F12 — `dashboard/lessons-learned.md` does.
- Does not assume any specific fund — reads `_FUND-METADATA.json`.

Keeping this file at orchestrator-only scope is what makes the architecture maintainable. Resist the temptation to inline review logic here.

---

## Version history

| Version | Date | Change |
|---|---|---|
| 8.1 | 2026-05-17 | Council-review remediation. Specificity-scored reconciler (replaces first-match-wins). Canonical three-field provenance chain. Regulatory citation discipline + corpus. Evergreen-accepted finding state. Halt-vs-degrade input discipline. 100% applicable coverage (replaces 80% threshold). Combined severity + coverage readiness gate. Structured CFO summary block. Subagent SLAs + timeouts. Model + reference version stamps. Mandatory structured location schema. Voice annotation replaces rewrite. Reconciler decision log + constituent toggle. Schema rejection chip + discard surveillance. OWNERSHIP.md + attribution footer + governance section. |
| 8.0 | 2026-05-16 | Decomposed monolithic v7 into orchestrator + 5 subagents. Box-manifest input model. Cross-layer pattern reconciler. Voice normalization. Coverage manifest. Fund-agnostic at scale. |
| 7.x | 2026-03-24 | Statement grouping default, mandatory section/sortOrder, statement-grouped PDF export, F-14/V-9 smoke tests, Lesson #27. |
| 6.x | Pre-2026 | L8 Hidden Row Intelligence, inline Edit mode, Undo stack + Ctrl+Z, preparer-scoped export. |

— End of orchestrator SKILL.md —
