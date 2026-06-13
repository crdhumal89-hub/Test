# SHINE v9 · Statement Health Intelligence Engine

Audit-facing financial statement review engine for the controllership function.
v9 rebuilds the foundation of the BASE skill (shine-agentic v8.1.1-rc) around
one defining principle: **computation is separated from judgment**, while
remaining a drop-in citizen of the BASE ecosystem (its schema, its check
taxonomy, its IO contract, its regression taxonomy).

Review. Refine. Ready.

## The three documents

| Document | Question it answers |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How does it work, and what guarantees does it make? |
| [`OPERATIONS.md`](OPERATIONS.md) | How do I use it, day to day? |
| [`SCALING.md`](SCALING.md) | How do I grow it: funds, frameworks, checks, the model adapter, the team? |

Plus: `RUNBOOK.md` (one screen), `CHANGELOG.md` (scorecard history),
`golden/REGRESSION-TC.md` (BASE TC-01..08 mapping).

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

## BASE (v8.1.1-rc) compatibility

v9 emits `findings_v8compat.json` on every run: the exact BASE schema shape
(subagent / subagentRaw / voiceNormalized / controllerEdited provenance,
layer, sortOrder, top-level version stamps), validated against the vendored
BASE schema file in the acceptance gate. Core relationship ids translate to
the BASE CHECK-n / TIE-n / FEEDER-n taxonomy via `schema/check_id_map.json`.
The BASE Stage 5f escalation matrix (RECURRING / REGRESSED / EVERGREEN) and
Stage 5g voice annotation run in the editor. The Box plugin-mode IO contract
is implemented behind an injectable MCP client (`ingest/box_adapter.py`) with
the audit-tree output convention available via config. The BASE regression
taxonomy TC-01..TC-08 is synthesized in the golden library.

## Layout deviations from the build spec (recorded)

- `io/` is named `ingest/` because a top-level `io` package shadows the Python stdlib module.
- This directory is part of the parent git repository (branch-mandated environment), not a nested repo. Phase-gate commits provide the same audit trail.
- The judgment layer's acceptance run uses the `rule_based` adapter because the build environment has no model API access. The `claude` adapter is the production path and hard-fails loudly if selected without credentials. The scorecard records the adapter used. The integration path and its re-certification gate are specified in `SCALING.md` section 5.

## Quick start

```
cd shine-v9
./run-ci.sh                                  # the full gate (suite + harness + claude floor cert)
python3 -m unittest discover -s tests -v     # unit + integration suite (155 tests)
python3 -m harness.preflight golden/<folder> # validate inputs without running
python3 run_review.py golden/<folder>        # single review -> _outputs/
python3 run_batch.py <root>                  # quarter-end multi-fund batch
python3 -m harness.runner                    # acceptance harness + scorecard
python3 -m harness.runner --adapter claude   # claude code-path floor certification
```

See `RUNBOOK.md` for the operator path and `CHANGELOG.md` for the scorecard history.
