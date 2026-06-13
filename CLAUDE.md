# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository topology

This is a **multi-project monorepo** for SHINE, an ASC 946 / IFRS / US GAAP fund financial-statement review system built for Apollo Mumbai Controllership. Four sibling top-level directories with distinct purposes and stacks:

- **`shine-v9/`** is the production engine. Python 3.11+, stdlib only at runtime (the `anthropic` SDK is an optional soft dependency for live LLM mode). This is where almost all engineering work happens.
- **`shine-fs-review-v8/`** is the **BASE skill** v9 is compatible with — a Claude Code skill (SKILL.md + reference corpus) for the v8.1 orchestrator/subagent architecture. **Treat the v8 finding schema, citation taxonomy, and reference corpus as a contract** v9 must honor; v9 vendors its schema at `shine-v9/schema/finding_schema_v8compat.json` and reads its corpus from `shine-fs-review-v8/reference/` plus `shine-v9/evidence/corpus_data/`.
- **`shine-app/`** is a separate client-side dashboard (vanilla HTML/CSS/JS, no build step, jsPDF vendored at `lib/`). Tests use Playwright via `test-headless.js` against a `localhost:8088` http-server.
- **`stock-subagent/`** is an **unrelated** Express + Anthropic SDK demo from the initial commit. Do not touch it unless explicitly asked.

The active branch is `claude/build-shine-v8-system-kzUiW` (PR #1). Commit messages follow a structured format with phase/version markers; preserve that style.

## shine-v9 — the engine

Everything below is in `shine-v9/` unless noted.

### Commands

```
./run-ci.sh                                  # full local gate: tests + harness + claude floor cert
python3 -m unittest discover -s tests        # 155-test suite
python3 -m unittest tests.test_X             # one module
python3 -m unittest tests.test_X.ClassName.test_method   # one test
python3 -m harness.golden_gen                # regenerate the golden library (deterministic)
python3 -m harness.runner                    # acceptance harness, writes harness/scorecard.{json,md}
python3 -m harness.runner --adapter claude   # claude code-path floor certification (canonical scorecard untouched)
python3 -m harness.preflight <review_folder> # validate inputs without running the engine
python3 run_review.py <review_folder>        # one review
python3 run_batch.py <root>                  # multi-fund batch; exit 1 if any not READY, 2 on failures
python3 -m ledger.dispositions <findings.json>   # disposition learning loop
```

CI runs the same gate at `.github/workflows/shine-v9-ci.yml`. The scorecard is uploaded as an artifact.

### The four-role pipeline (the core mental model)

```
inputs/ -> ingest/ -> frameworks/ -> core/ -> judges/ (behind ModelAdapter)
                                            -> evidence/verifier (citation gate)
                                            -> schema/validator
       -> skeptic/ -> reconcile/escalation -> reconcile/reconciler
                  -> reconcile/voice -> reconcile/calibration (suppression)
       -> schema/compat -> render/ (dashboard + dual PDF) -> _outputs/
```

Two non-obvious invariants enforced everywhere; violating them will silently break the audit gate:

1. **No model performs arithmetic.** `core/` is pure Python, Decimal-exact, CERTAIN by construction. Adding any model call to anything under `core/` is a release blocker.
2. **No silent skips or drops.** Every check either runs or carries a reason_code; every rejected finding lands in `rejected_findings.json`; every reconciler decision is logged. Adding code that returns early without recording is a release blocker.

### Pipeline ordering (the easy thing to get wrong)

In `run_review.py`, the editor sequence is **escalation -> reconciliation -> voice -> suppression**, not the other way around. Reordering will silently lose prior-review recurrence on clustered findings — see `tests/test_audit_fixes.py::ClusterRecurrence`. Synthetic-resolved entries are kept OUT of the reconciler input.

After the editor, `validate_all` runs again (final pass): every reconciler root, synthetic entry, and escalation/voice mutation must still satisfy `schema/validator.py`. Failures route to `rejected_findings.json`, never to output.

### The dual-schema discipline

Every run emits **three** JSON shapes from one internal form:

- `findings.json` — v9 calibrated form (`source`, `confidence_calibrated`, `materiality`, `suppressed`, nested `versions`)
- `findings_v8compat.json` — the BASE v8.1.1-rc shape (`subagent`, `subagentRaw`, top-level version stamps, `evidence.check_ref`); validated against `schema/finding_schema_v8compat.json` in the gate every run
- `findings_app.json` — the shine-app dashboard's import shape

Mapping lives in `schema/compat.py`. The BASE check-id taxonomy (CHECK-n / TIE-n / FEEDER-n / XLSX-1) is published in `schema/check_id_map.json`. When adding a `core/` relationship, add it to that map or the BASE projection will drop the `check_ref`.

### The ModelAdapter contract

`judges/adapter.py` boundary; three implementations:

- `RuleBasedAdapter` — deterministic, the CI and acceptance baseline.
- `ClaudeAdapter` with `ReplayClient` — cassette-driven; lets the full claude code path run offline. CI runs `harness.runner --adapter claude` with an empty cassette to certify the model-only-adds floor.
- `ClaudeAdapter` with `AnthropicLiveClient` — the live path. Auto-wired when `ANTHROPIC_API_KEY` is set and the `anthropic` package is installed. **There is no silent rule_based fallback**: missing credentials raise `AdapterNotConfigured`.

The model **only adds**, never removes or weakens a rule finding. Floor protection dedups on `(statement, section, category)` slots in `ClaudeAdapter.run_reviewer`. Touching that dedup logic risks letting the model launder a floor finding into a different category — keep it slot-based, not key-based.

### The acceptance gate (what "done" means)

Eight checks in `harness/runner.py::run_harness`, all must be true to commit a release:

- must-catch recall = 1.0, overall recall >= 0.95, overall precision >= 0.90
- clean drafts emit 0 findings, 0 unverifiable citations reach output
- two runs on identical inputs produce byte-identical ledgers (`ledger.json` is **timestamp-free** by design; timing lives in `telemetry.json`)
- 0 em dashes in any artifact (`schema/validator.py` enforces this on `message`/`fix`/`statement`/`section`; `render/pdf_writer.py::latinize` transliterates curly quotes/dashes; `evidence/corpus.py` sanitizes at load)
- 0 v8compat schema violations

When changing rules, the harness is the source of truth, not the unit suite alone. Always run `./run-ci.sh` before declaring work complete.

### Input contract

A review folder has `inputs/` with `figures.json` (halt-required), `notes.json`, `_FUND-METADATA.json`, `_REVIEW-MANIFEST.json`, and optionally `prior_figures.json`, `prior_findings.json`, `sibling_figures.json`. Templates: `templates/*.template.json`. The framework comes from `_FUND-METADATA.json::presentation.framework` and is **never defaulted** — absence halts.

Two output modes in `ingest/outputs.py`: `simple` (`<folder>/_outputs/`, deterministic, used by tests and the harness) and `audit_tree` (`<root>/_outputs/<folder>/<reviewer>-<stamp>/`, the BASE production convention — reviewer/stamp are path-component-validated).

### Conventions worth knowing

- `merge_key` shape is `statement::section::line_or_check_id::category`. Checklist findings re-key on `check_id` after construction (see `judges/common.py`) to avoid `...::note::...` collisions when `line_id` and `note_id` are both absent.
- Voice annotation is **annotation, not rewrite**: `message` is immutable; polished alternatives land in `voice_normalized`; PROBABLE/POSSIBLE hedging is never stripped (see `reconcile/voice.py`).
- `io/` is named `ingest/` because a stdlib `io` package shadow blocked the original name.
- Skeptic's `NO_DEMOTION` set in `skeptic/skeptic.py` exempts substance checks (e.g. liquidation-basis adoption) from the deficiency-vs-absence demotion path. New substance checks that should not be softened by note presence go here.

### Documentation map

- `QUICKSTART.md` — non-coder walkthrough; mention this when the user asks "how do I use this".
- `ARCHITECTURE.md` / `OPERATIONS.md` / `SCALING.md` — engineer / operator / team-lead docs respectively.
- `CHANGELOG.md` — scorecard history; every release records its acceptance numbers here.
- `golden/REGRESSION-TC.md` — mapping from BASE TC-01..TC-08 to v9 fixtures.

## shine-app — the dashboard

Pure client-side. `npm start` runs `serve` on port 3000; the test harness uses `http-server` on port 8088. Tests via `node test-headless.js` (Playwright at `/opt/node22/lib/node_modules/playwright`, Chromium at `/opt/pw-browsers/chromium-1194/`). Visual regression screenshots land in `test-screenshots/`.

Two data shapes interop with shine-v9: the dashboard imports the engine's `findings_app.json` directly. Schema migrations are handled in-app via the `_schema` field on localStorage payloads.

## shine-fs-review-v8 — the BASE skill

A Claude Code skill (frontmatter at `SKILL.md`). Engineering changes here are rare; the skill is a stable contract v9 honors. If touching `manifests/finding-schema.json`, **also update the v9 vendored copy** at `shine-v9/schema/finding_schema_v8compat.json` and verify the harness's `v8compat_schema_valid` gate still passes. Citation corpus files under `reference/` are indexed by `shine-v9/evidence/corpus.py`; adding entries there automatically extends the verifier without v9 code changes (the citation-drift meta-test will fail loudly if a v9 checklist references a key that does not resolve).
