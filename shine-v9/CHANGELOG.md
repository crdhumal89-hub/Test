# SHINE v9 CHANGELOG

## v9.1.1 (2026-06-13) · Audited and shipped

Pre-delivery expert audit (two independent fresh-eyes reviewers plus probes),
the model path completed and made testable offline, and the operational
tooling for a quarter-end launch.

### Acceptance scorecard (committed at harness/scorecard.json)

| Metric | Value | Bar | Status |
|---|---|---|---|
| Must-catch recall | 1.0000 (31/31) | 1.00 | PASS |
| Overall recall | 1.0000 (39/39) | >= 0.95 | PASS |
| Overall precision | 1.0000 (0 FP) | >= 0.90 | PASS |
| Clean-draft findings | 0 | 0 | PASS |
| Unverifiable citations in output | 0 | 0 | PASS |
| BASE-schema validity | 0 violations | 0 | PASS |
| Deterministic ledgers | byte-identical | required | PASS |
| Em dashes in artifacts | 0 | 0 | PASS |
| Unit + integration suite | 155/155 | green | PASS |
| Claude code-path floor certification | GATE GREEN | green | PASS |

### Audit fixes (9 real bugs; one flagged-Critical was a false positive)

A `pages_id` "Critical" was disproven by a 3-page build probe (the prediction
is correct). The nine real bugs, each with a regression test in
`tests/test_audit_fixes.py`: PDF non-latin-1 mangling (added `latinize`);
CLI raw tracebacks (clean stderr + exit codes; `--config` bounds); findings
never re-validated after the editor (final validation pass; invalids routed
to rejected); escalation reordered before reconciliation so clustered
constituents keep recurrence and the root propagates the strongest; citation
regex now indexes multi-letter paren suffixes; `x_note_found` scaffolding
stripped; synthetic-resolved preserves the prior layer; checklist merge_keys
re-keyed on check_id to prevent collision; audit_tree path-traversal guard.

### Model path completed (P0)

`ClaudeAdapter` now runs the deterministic floor, builds the reviewer prompt,
parses model JSON into v9 findings, dedups against the floor by
(statement, section, category), and returns floor plus additions. The model
only ADDS; additions still face citation verification, schema validation, and
the skeptic. `ReplayClient` runs the whole path offline from a recorded
cassette, so CI certifies it with no network. `tests/test_model_adapter.py`
proves a valid model finding reaches output, a fabricated-citation model
finding is rejected, and an echo of a floor finding is deduped out. The only
remaining step for live use is a `ModelClient.complete` that calls the pinned
model (SCALING.md section 5).

### Operational tooling (P2)

- `python3 -m harness.preflight <folder>`: validate inputs without running.
- `run-ci.sh` and `.github/workflows/shine-v9-ci.yml`: the full gate on every
  change, scorecard uploaded as an artifact.
- `python3 -m harness.runner --adapter claude`: floor certification of the
  claude code path; the canonical scorecard stays rule_based.

## v9.1.0 (2026-06-12) · The best-of-both-worlds release

v9.0.0 proved the architecture (computation separated from judgment, verified
citations, adversarial skeptic, reproducible ledgers). v9.1.0 makes the engine
a drop-in citizen of the BASE (shine-agentic v8.1.1-rc) ecosystem and ships
the deployment documentation set.

### Acceptance scorecard (committed at harness/scorecard.json)

| Metric | Value | Bar | Status |
|---|---|---|---|
| Must-catch recall | 1.0000 (31/31) | 1.00 | PASS |
| Overall recall | 1.0000 (39/39 expected defects) | >= 0.95 | PASS |
| Overall precision | 1.0000 (0 false positives) | >= 0.90 | PASS |
| Clean-draft findings | 0 across 6 clean/trap fixtures | 0 | PASS |
| Unverifiable citations in output | 0 | 0 | PASS |
| BASE-schema validity of compat emission | 0 violations | 0 | PASS |
| Deterministic ledgers | byte-identical | required | PASS |
| Em dashes in generated artifacts | 0 | 0 | PASS |
| Unit suite | 129/129 | green | PASS |

Golden library: 34 fixtures, 39 expected defects, including the BASE
regression taxonomy TC-01 through TC-08 (mapping: golden/REGRESSION-TC.md).
Adapter measured: rule_based. Model pin recorded: claude-fable-5.

### BASE ecosystem integration (best of both worlds)

- Dual-shape emission: findings_v8compat.json in the exact BASE schema,
  validated against the vendored BASE schema file in the gate; check-id
  translation published (schema/check_id_map.json: CHECK-n / TIE-n /
  FEEDER-n / XLSX-1).
- BASE Stage 5f prior-review escalation: RECURRING / REGRESSED / EVERGREEN
  matrix on merge_key, synthetic RESOLVED entries, escalation log; evergreen
  excluded from readiness (invariant 16).
- BASE Stage 5g voice annotation (annotation mode): hedged CERTAIN text gets
  a polished voiceNormalized alternative; originals immutable;
  PROBABLE/POSSIBLE hedging never stripped.
- BASE plugin-mode IO contract: Box adapter behind an injectable MCP client
  (search_folders_by_name / list_folder_content_by_folder_id /
  get_file_content), loud halt without a client; audit-tree output mode
  ({root}/_outputs/{path}/{reviewer}-{stamp}/).
- Coverage split per invariant 17 v8.1.1: scope_coverage_pct and
  applicability_documented_pct; readiness gate updated.
- New checks: NAV practical expedient (ASC 820-10-50-6A), liquidation basis
  (ASC 205-30-25-1) with a skeptic NO_DEMOTION exemption for substance
  checks, ASC 250 transition disclosure, L4 formatting conventions.
- run_batch.py: quarter-end multi-fund batch with per-fund verdict table and
  machine-readable summary; one fund's failure never blocks the rest.
- Documentation set: ARCHITECTURE.md (how it works), OPERATIONS.md (how to
  use it), SCALING.md (how to grow it), golden/REGRESSION-TC.md.

### Field note from the harness

The TC-06 liquidating-fund case caught a real skeptic flaw during this
release: the deficiency-vs-absence demotion softened a liquidation-basis
finding because the policies note existed. Substance checks now carry a
NO_DEMOTION exemption. The acceptance harness paid for itself before launch.

## v9.0.0 (2026-06-12)

First release of the v9 engine. Four-role pipeline with computation separated
from judgment by construction; the acceptance gate is GREEN on the committed
golden library.

### Acceptance scorecard (committed at harness/scorecard.json)

| Metric | Value | Bar | Status |
|---|---|---|---|
| Must-catch recall | 1.0000 (22/22) | 1.00 | PASS |
| Overall recall | 1.0000 (30/30 expected defects) | >= 0.95 | PASS |
| Overall precision | 1.0000 (0 false positives) | >= 0.90 | PASS |
| Clean-draft findings | 0 across 6 clean/trap fixtures | 0 | PASS |
| Unverifiable citations in output | 0 | 0 | PASS |
| Deterministic ledgers (identical inputs) | byte-identical | required | PASS |
| Em dashes in generated artifacts | 0 | 0 | PASS |
| Unit suite | 105/105 | all green | PASS |

Adapter measured: rule_based (deterministic). Model pin recorded: claude-fable-5.
Golden library: 26 fixtures, 30 expected defects spanning arithmetic,
presentation, disclosure, standards, comparative, regulatory and a reconciler
cluster, across ASC 946 and IFRS (plus a US GAAP clean draft). Two skeptic
trap fixtures confirm the false-positive defense (3 baseline FPs reduced to 0
in the dedicated skeptic suite).

### Known limitations (read before the pilot)

1. The acceptance run measures the rule_based judgment adapter. The claude
   adapter is a pinned production stub that halts without credentials; it must
   be integrated and the harness re-run before any model-augmented run is
   trusted. The scorecard records which adapter produced it.
2. The golden library was authored alongside the rules it tests. The score is
   honest but self-referential; production dispositions feed new fixtures via
   the learning loop, which is the intended corrective.
3. The engine ingests structured figures.json plus a machine-readable tie-out.
   PDF figure extraction is an upstream adapter concern by design: extracted
   figures must reconcile against the tie-out workbook before use, so
   extraction errors surface as tie-out breaks rather than silent inputs.
4. The IFRS and CSSF corpus files are v9-authored summaries pending steward
   attestation under the 180-day freshness window. The v8 ASC and regulatory
   corpus carries its own attestation.
5. Checklist depth varies by framework: ASC 946 is deepest, IFRS covers the
   investment-entity core (IAS 1, IFRS 7, 10, 12, 13), US GAAP is the thinnest.
   CLO/CDS-specific and waterfall-specific checks are roadmap items: the
   framework interface accepts them without architectural change.

### Phase log

- Phase 0: scaffold, v9 schema + validator, config registry, failing smoke test.
- Phase 1: deterministic core (Decimal-exact, 31 tests, zero model involvement).
- Phase 2: ingest with halt-vs-degrade; reproducibility ledger (no timestamps,
  byte-identical across identical runs).
- Phase 3: pluggable frameworks ASC946 / IFRS / USGAAP selected from metadata,
  halt on absence; SCF divergence encoded.
- Phase 4: evidence layer; citation verifier; checklist-corpus drift meta-test.
- Phase 5: five reviewers behind the adapter boundary; clean drafts emit zero
  judgment findings in all three frameworks.
- Phase 6: adversarial skeptic; measured FP reduction (3 to 0 on the trap).
- Phase 7: reconciler with preserved constituents, suppression, dashboard
  (node-validated), dual PDF export, thin orchestrator; determinism verified.
- Phase 8: telemetry; disposition learning loop feeding golden candidates.
- Phase 9: golden library (26 fixtures) + falsifiable acceptance harness.
- Phase 10: acceptance run GREEN; this release note.
