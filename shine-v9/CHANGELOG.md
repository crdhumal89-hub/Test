# SHINE v9 CHANGELOG

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
