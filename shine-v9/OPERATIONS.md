# SHINE v9 · Operations Guide

How to install, run, read, disposition, and export. Written for the
controller and the analysts who will run reviews without the controller
re-checking every run. No engineering background assumed beyond running a
command. Companion: `ARCHITECTURE.md` (how it works), `SCALING.md` (growth).

---

## 1. Install

Nothing to install. The engine is standard-library Python 3.11+.

```
git clone <repo>
cd shine-v9
python3 -m unittest discover -s tests    # 126 tests; expect OK
python3 -m harness.runner                # acceptance gate; expect GATE GREEN
```

Run both once after cloning and after every update. If either is not green,
stop and contact the Steward: do not review live drafts on a red engine.

## 2. Prepare a review folder

```
<fund>/<period>/Draft-N/
  inputs/
    _REVIEW-MANIFEST.json     review id, period, draft label
    _FUND-METADATA.json       fund facts: legal name, domicile, framework
                              (ASC946 | IFRS | USGAAP), jurisdictions,
                              materiality, linked entities, liquidating /
                              policy_change_in_period flags
    figures.json              the statement figures, structured
    notes.json                the notes, as titled text blocks
    prior_figures.json        optional: prior-period figures (enables YOY)
    prior_findings.json       optional: findings.json from the previous SHINE
                              run (enables RECURRING/REGRESSED escalation and
                              evergreen carry-forward)
    sibling_figures.json      optional: feeder/master figures (enables
                              inter-entity ties)
```

Templates for every file live in `golden/clean_asc946/inputs/`: copy that
folder and replace the values. Two rules the engine enforces:

- `figures.json` is the only halt-required input. Anything else missing
  degrades the review with a visible chip and a coverage reduction: never
  silently.
- The framework comes from metadata. If `presentation.framework` is absent,
  the run halts rather than assuming ASC 946.

Where do figures come from? From your tie-out workbook export or the
extraction step of your pipeline. The engine cross-checks every figure
against the `tie_out` map inside figures.json, so a bad extraction shows up
as a tie-out break, not a silent wrong number.

## 3. Run a review

```
python3 run_review.py <path>/Draft-1.1
```

Console output:

```
SHINE v9 run 1f2a...: 4 findings, NOT_READY (1 critical unresolved ...)
outputs: <path>/Draft-1.1/_outputs
```

Everything lands in `_outputs/`:

| File | What it is |
|---|---|
| `dashboard.html` | Open in any browser. The review surface. |
| `findings.json` | v9 findings (calibrated confidence, materiality, suppression) |
| `findings_v8compat.json` | The same findings in the v8.1.1-rc shape for existing consumers |
| `findings_app.json` | Import file for the premium web dashboard (`../shine-app/`) |
| `preparer_export.pdf` | OPEN + ACCEPTED findings, suppressed excluded: send to the administrator |
| `audit_file_export.pdf` | Everything except DISCARDED, with skeptic and reconciler provenance: the audit file |
| `coverage_manifest.json` | Every check run, every skip with its reason code |
| `ledger.json` | The reproducibility record: hashes, versions, results digest |
| `skeptic_decisions.json`, `reconciler_decisions.json`, `escalation_log.json`, `rejected_findings.json` | Decision trails |

## 4. Read the dashboard

Top to bottom: the **readiness banner** (READY green, READY WITH EXCEPTIONS
amber, NOT READY red, with the driver spelled out), the **CFO summary**
(entity, framework and pins, finding counts, coverage, run id), **chips**
(suppressed counts, skeptic demotions, reconciler roots), then findings
**grouped by statement in FS page order**.

Each finding card carries: severity and confidence, the source reviewer, the
exact location, the message (with the polished alternative when one exists),
the verified citation when the claim rests on authority, the skeptic's
rationale when it was challenged, the recommended fix, and the reconciler
constituents behind any root cause (click to expand).

## 5. Disposition

On each card: **Accept** (agree, not yet fixed) · **Resolve** (fixed in the
next draft) · **Discard** (false positive or not applicable) · **Reopen**.
Ctrl+Z undoes, twenty levels deep. State persists in the browser per run id.

Two disciplines the engine expects of you:

- Discards feed the learning loop. After dispositioning, run
  `python3 -m ledger.dispositions <path>/_outputs/findings.json` so discarded
  findings become candidate false-positive fixtures and accepted CRITICALs
  become must-catch fixtures.
- Recurring LOW/MEDIUM findings that you and the auditor accept as documented
  practice should be marked `evergreen_accepted` in the findings file you
  pass as `prior_findings.json` next period: they stop escalating and stop
  blocking readiness while staying on the audit file.

## 6. Re-export after disposition

The exports regenerate from any findings file, so the post-disposition state
flows into fresh PDFs:

```
python3 run_review.py <path>/Draft-1.1     # re-runs and re-renders everything
```

(Dispositions live in the dashboard's browser storage and in the findings
file you maintain; the canonical handoff is your dispositioned findings.json
fed back as the next run's prior_findings.json.)

## 7. Box mode and Cowork / Claude Code

The engine implements the BASE plugin-mode IO contract. Local folders are the
fallback path that always works; Box is the production path once the MCP
client is injected:

- Box discovery uses `search_folders_by_name`,
  `list_folder_content_by_folder_id`, `get_file_content`: the exact tool
  surface Cowork and Claude Code expose.
- Box mode without a configured client HALTS with instructions: the engine
  never silently falls back. When Box is unreachable the BASE prompt applies:
  "Box unreachable: switch to local fallback at [path]? (Yes / Retry Box)".
- Production output convention (`config: output.mode = "audit_tree"`):
  `{root}/_outputs/{path}/Draft-N/{reviewer}-{YYYYMMDD-HHMM}/`: runs never
  collide and input folders are never touched.

## 8. Batch (quarter-end)

```
python3 run_batch.py <root-folder>
```

Discovers every review folder under the root (anything with
`inputs/figures.json`), runs each independently, prints the summary table
(verdict, finding counts, scope coverage per fund), and writes
`_outputs_batch_summary.json`. Exit code 0 all READY, 1 any not ready,
2 any run failure. One fund's failure never blocks the rest.

## 9. Troubleshooting

| Symptom | Meaning | Action |
|---|---|---|
| Run halts: "halt-required input missing" | No figures.json | Add it; everything else merely degrades |
| Run halts: "does not declare presentation.framework" | Metadata incomplete | Set ASC946 / IFRS / USGAAP in metadata |
| Finding in `rejected_findings.json` with reason "citation" | A reviewer cited authority the corpus cannot verify | The finding never reached you: that is the defense working. Steward investigates the reviewer or extends the corpus |
| `skips_without_reason` above 0 in coverage | A check was skipped silently | Treat as a control gap; it already blocks READY; file it with the Steward |
| Adapter error: "adapter=claude requires ..." | Model mode selected without credentials | Run rule_based, or complete the model integration per SCALING.md |
| Two runs differ on identical inputs | Version drift | Diff the two `ledger.json` files: the changed hash names the cause |

## 10. The checks behind the curtain (quick reference)

Arithmetic: section footing, balance, SOI/SOC/SOO/SCF ties, roll-forward
closure per class, NAV per unit, expense and NII ratios, tie-out workbook
agreement. Presentation: required statements per framework, entity identity,
period and currency conventions, ratio formatting. Disclosure and standards:
the framework checklist (hierarchy, Level 3 reconciliation and inputs, NAV
practical expedient, derivatives volume, liquidation basis, ASC 250
transition, subsequent events, related party, policies, recent standards;
IFRS: IAS 1 completeness, IFRS 7/10/12/13). Regulatory: CIMA PFA, CSSF
supervision, SEC custody-rule context. Comparative: unexplained material
movements, feeder-to-master ties. Every claim of authority carries a
verified citation; every CRITICAL/HIGH judgment survived the skeptic.
