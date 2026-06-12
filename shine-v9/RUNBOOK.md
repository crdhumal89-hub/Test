# SHINE v9 RUNBOOK (one screen)

## Run a review
```
python3 run_review.py <review_folder>
```
`<review_folder>` must contain `inputs/` with: `_REVIEW-MANIFEST.json`,
`_FUND-METADATA.json`, `figures.json`, `notes.json`, optionally
`prior_figures.json` and `sibling_figures.json`.
Outputs land in `<review_folder>/_outputs/`: `findings.json` (v9), `findings_app.json`
(v8 dashboard shape), `dashboard.html`, `coverage_manifest.json`, `ledger.json`,
`telemetry.json`, `preparer_export.pdf`, `audit_file_export.pdf`, plus the decision logs.

## Run the acceptance harness
```
python3 -m harness.runner
```
Writes `harness/scorecard.json` and `harness/scorecard.md`. The gate is green only when:
must-catch recall = 100%, clean drafts = 0 findings, precision >= 0.90, recall >= 0.95,
zero unverifiable citations, two identical runs produce identical ledgers.

## Record a disposition (learning loop)
```
python3 -m ledger.dispositions <review_folder>/_outputs/findings.json
```
Appends to `config/feedback.json` and nominates golden candidates.

## Change thresholds
Edit `config/default.json` (steward-controlled). Materiality, suppression,
skeptic scope, corpus freshness. Every run records the config hash in its ledger.

## If something fails
- Validator rejections: `<review_folder>/_outputs/rejected_findings.json`
- Citation failures: same file, reason `citation`
- Adapter not configured: the run HALTS with an explicit error. It never degrades silently.
