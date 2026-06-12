# SHINE v9 · Statement Health Intelligence Engine

Audit-facing financial statement review engine for the controllership function.
v9 rebuilds the foundation of the v8.1 skill (`../shine-fs-review-v8/`, the BASE)
around one defining principle: **computation is separated from judgment**.

Review. Refine. Ready.

## The four-role pipeline

| Role | Directory | What it does | Model involvement |
|---|---|---|---|
| Deterministic core | `core/` | Proves every arithmetic relationship: footing, cross-footing, statement tie-outs, balance, roll-forward closure, per-unit and ratio math, tie-out-workbook agreement | **None, ever.** Pure Python. CERTAIN by construction |
| Judgment layer | `judges/` | Presentation conformity, disclosure adequacy, standards mapping, comparative and inter-entity reasoning, regulatory exposure | Behind `ModelAdapter`: `rule_based` (deterministic, CI baseline) or `claude` (production, pinned) |
| Evidence layer | `evidence/` | Retrieval over the authority corpus; **citation verification**: a standards or regulatory finding with an unverifiable citation is rejected and logged, never shown | Retrieval is deterministic |
| Adversarial pass | `skeptic/` | Argues the contrary case on every CRITICAL and HIGH finding before it reaches the dashboard; demotes or drops with logged reasoning | Same adapter discipline |

Editor layer: `reconcile/` (specificity-scored reconciler, calibration, materiality
suppression), `render/` (dashboard plus dual PDF export). Spine: `ingest/` (input
discovery, manifest readers, outputs writer), `ledger/` (reproducibility ledger,
telemetry, disposition loop), `schema/` (v9 finding schema plus validator),
`harness/` and `golden/` (seeded-defect acceptance corpus and scorecard runner).

## Key v9 properties

- **No model performs arithmetic.** Anywhere. The core suite is the largest test surface in the repo.
- **Framework-pluggable.** ASC 946, IFRS, US GAAP selected from `_FUND-METADATA.json`, never assumed.
- **Verified citations only.** `evidence/verifier.py` resolves every citation key to real corpus text before a finding passes.
- **Reproducible.** The run ledger pins model, prompts, corpus and input content hashes. Identical inputs produce byte-identical ledgers.
- **Tested against a golden library.** `golden/` holds 20+ review folders with expected-finding manifests. The acceptance gate (`harness/`) requires 100% must-catch recall, zero findings on clean drafts, and zero unverifiable citations.

## Layout deviations from the build spec (recorded)

- `io/` is named `ingest/` because a top-level `io` package shadows the Python stdlib module.
- This directory is part of the parent git repository (branch-mandated environment), not a nested repo. Phase-gate commits provide the same audit trail.
- The judgment layer's acceptance run uses the `rule_based` adapter because the build environment has no model API access. The `claude` adapter is the production path and hard-fails loudly if selected without credentials. The scorecard records the adapter used.

## Quick start

```
cd shine-v9
python3 -m unittest discover -s tests -v     # full suite
python3 run_review.py golden/<folder>        # single review
python3 -m harness.runner                    # acceptance harness + scorecard
```

See `RUNBOOK.md` for the operator path and `CHANGELOG.md` for the scorecard history.
