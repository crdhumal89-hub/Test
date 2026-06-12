# SHINE v9 CHANGELOG

## Unreleased

### Phase 0 · Scaffold
- Repo structure (core, frameworks, judges, skeptic, evidence, reconcile, render, ledger, ingest, schema, harness, golden, tests, config).
- v9 finding schema (`schema/finding_schema.json`) and stdlib validator (`schema/validator.py`): calibrated confidence, materiality block, verified-citation discipline for standards and regulatory findings, CERTAIN-by-construction rule for core findings, em-dash prohibition on generated text.
- Config registry (`config/default.json`): tolerances, materiality bases, suppression, skeptic scope, corpus paths and freshness window, role registry, acceptance bars, MODEL_PIN.
- Failing smoke test (fails for the right reason: engine entrypoint not yet implemented).

Scorecard: not yet run. The acceptance gate numbers will be recorded here at Phase 10.
