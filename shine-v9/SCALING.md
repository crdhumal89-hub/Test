# SHINE v9 · Scaling Guide

How the engine grows: more funds, more frameworks, more checks, the model
adapter, and the governance that keeps quality from drifting while it grows.
Companion: `ARCHITECTURE.md`, `OPERATIONS.md`.

---

## 1. Scaling across funds (today, no changes needed)

The engine is fund-agnostic by invariant: identity, framework, jurisdictions,
materiality, and linked entities all come from `_FUND-METADATA.json`. Scaling
to the full fund universe is a data exercise:

- One metadata file per fund (one-time, updated on fund-fact changes).
- `run_batch.py <root>` runs every review under a root sequentially with a
  per-fund verdict table. A 50-fund quarter-end batch with rule_based
  reviewers completes in seconds; the binding constraint is preparing
  figures.json per fund, not engine throughput.
- Each run is independent: own ledger, own outputs, own audit trail. A
  failure in one fund is reported and never blocks the rest.

For parallel execution beyond sequential batch, shard the root across
processes; runs share nothing but the read-only corpus.

## 2. Scaling the check inventory

Three extension points, in increasing order of ceremony:

1. **A new arithmetic relationship** (`core/checks.py`): add a pure function
   returning Breaks, register in `ALL_CHECKS`, add the broken-fixture unit
   test, map the id in `schema/check_id_map.json`. The harness will fail if
   a fixture emits it unexpectedly: enumerate blast radius in expected files.
2. **A new checklist item** (`frameworks/*.py`): declare applicability from
   figures or metadata flags, a citation key, note title and text patterns,
   severity, message, fix. The corpus drift meta-test forces the citation to
   resolve; the synonym table in `skeptic/skeptic.py` should gain an entry if
   the disclosure has common alternative phrasings; add a golden fixture.
3. **A new reviewer**: implement `(ctx) -> (findings, coverage)` in
   `judges/reviewers.py`, register in `REVIEWERS`, map its source in
   `schema/check_id_map.json`. Reviewers must declare every check or a
   reason-coded skip: the gate enforces it.

CLO waterfall checks, CDS disclosure checks, and multi-tier carry math all
fit pattern 1 or 2 without architectural change: the framework interface and
the core engine are the designed homes for them.

## 3. Scaling frameworks

`frameworks/registry.py` maps a metadata string to an engine class. Adding
Lux GAAP (or any framework): subclass `FrameworkEngine` (statement names,
required statements, checklist), add the authority corpus file under
`evidence/corpus_data/` with indexable citation keys, register, and add at
minimum one clean and one defective golden fixture. The drift meta-test and
the harness do the rest. IFRS took ~150 lines end to end; expect similar.

## 4. Scaling the corpus

Corpus files are markdown with indexable keys (bold ASC/IFRS entries,
`JURIS:KEY` headings). To extend: add entries, run the suite (the drift test
and the citation verifier validate integration), record the attestation date
in the file header. The Steward refreshes within the 180-day freshness window
per the BASE OWNERSHIP cadence. Corpus file hashes are stamped into every run
ledger, so any finding can be traced to the exact corpus version that
grounded it.

## 5. Integrating the production model (the claude adapter)

The model path is **built and tested**; the only thing a live run adds is a
real network call. `ClaudeAdapter` (judges/adapter.py) already runs the
deterministic floor, builds the reviewer prompt, parses the model's JSON
response into v9 findings, dedups against the floor, and returns floor plus
additions. The entire code path is exercised offline by `ReplayClient` (a
recorded-cassette ModelClient) so CI certifies it without credentials.

To go live:

1. Implement a `ModelClient` whose `complete(prompt) -> str` calls the pinned
   model via the Anthropic SDK, and inject it:
   `ClaudeAdapter(model_pin, client=YourLiveClient())`. That one method is the
   only network touchpoint; everything around it is done.
2. Keep MODEL_PIN pinned and recorded; any pin change is a version event in
   the ledger.
3. The hybrid guarantee, already enforced in code: the floor findings are
   deterministic and measured; the model may only ADD, never remove or weaken.
   Model additions are deduped against the floor on the
   (statement, section, category) slot, then face citation verification,
   schema validation, and the skeptic. A model finding citing unverifiable
   authority is rejected before anyone sees it (proven by
   `tests/test_model_adapter.py`): the architecture already contains the
   model's principal failure mode.
4. **Re-certify before trusting a model-augmented run.** Two gates:
   - `python3 -m harness.runner --adapter claude` runs the golden library on
     the claude code path with an empty cassette (model adds nothing): the
     floor, and thus the whole gate, must stay GREEN. CI runs this every
     change.
   - A live-response certification: record real model responses into a
     cassette, run the harness against them, and commit that scorecard. A
     claude-adapter live scorecard that has not been committed does not exist.
     Expect to add golden traps for model-specific failure modes (verbosity,
     hedging, citation invention) and tune until green.
5. Reproducibility under a live model: temperature 0 and pinned versions get
   close but not byte-identical; the ledger's results digest tells you exactly
   when outputs drift run-to-run. Treat digest instability as a release
   blocker for unsupervised use. The ReplayClient path stays fully
   deterministic and is what CI depends on.

## 6. Scaling the golden library (the learning loop)

The library grows from production use, not authorship:

- Every controller discard nominates a false-positive fixture; every accepted
  CRITICAL nominates a must-catch fixture
  (`python3 -m ledger.dispositions <findings.json>` accumulates them in
  `config/feedback.json`).
- The Steward promotes candidates into `golden/` at the quarterly review:
  anonymize, write the expected manifest, regenerate, re-run the harness.
- Replace the synthetic TC-01..08 inputs with exported historical reviews as
  they become available (mapping in `golden/REGRESSION-TC.md`).
- The bar never moves down: must-catch recall stays at 100 percent, clean
  drafts stay at zero findings, and a fixture once added is never removed
  without an OWNERSHIP-logged decision.

## 7. Scaling the team (governance)

The BASE Architect / Steward / Approver model applies unchanged:

| Change class | Who approves | Gate |
|---|---|---|
| Invariants, schema, reconciler scoring, readiness thresholds | Architect | Full suite + harness green |
| Checklist items, corpus content, skeptic synonyms | Steward (Architect on pattern changes) | Drift test + harness green |
| New golden fixtures | Steward | Harness green, must-catch preserved |
| Adapter integration, MODEL_PIN changes | Architect + Approver | Claude-adapter scorecard committed |
| Thresholds in config | Steward | Config hash changes are visible in every ledger |

Quarterly cadence (per OWNERSHIP): discard-rate by category from the feedback
record, golden candidate promotion, corpus attestation refresh, scorecard
re-run and commit.

## 8. Deployment shapes

| Shape | What it looks like | When |
|---|---|---|
| Analyst workstation | Clone, run locally on a review folder | Today; the default |
| Quarter-end batch | `run_batch.py` over the review root, summary table to the controller | Today |
| Cowork / Claude Code plugin | The BASE skill invokes the engine; Box MCP client injected into `ingest/box_adapter.py`; outputs written to the audit tree | After the Box client integration (one constructor argument) |
| CI service | The unit suite + harness on every change; scorecard as the merge gate | Wire `python3 -m unittest discover -s tests && python3 -m harness.runner` into any runner |

A compliance note that does not change with deployment shape: fund draft FS
are regulated data. Run the engine where the data is allowed to live; as of
this writing that means Claude Code desktop / local execution for regulated
workloads, with Cowork pending its compliance certification.

## 9. Performance envelope

Rule-based, current library: a full review runs in well under a second; the
34-fixture harness including determinism re-runs completes in seconds. The
engine is IO-light (a handful of JSON files per review) and memory-light
(figures, notes, and findings for one fund at a time). The first real
bottleneck on the horizon is model-adapter latency, which parallelizes per
reviewer inside `run_reviewer` without contract changes.
