# SHINE v9 · Architecture

How the engine works, why it is shaped this way, and what guarantees it makes.
Companion documents: `OPERATIONS.md` (how to use it) and `SCALING.md` (how to
grow it). Audience: engineers, the Steward, and any auditor asking "how was
this draft reviewed".

---

## 1. The one-sentence design

SHINE v9 separates **computation** from **judgment**: every arithmetic fact is
proven by deterministic Python before any reviewer reasons about anything, and
every judgment-layer claim must survive citation verification and an
adversarial challenge before a controller sees it.

## 2. The four-role pipeline

```
                     +--------------------------------------+
   inputs/           |   ORCHESTRATOR  (run_review.py)      |        _outputs/
   figures.json ---> |   thin: coordinates, never reviews   | ---->  findings.json
   notes.json        +-------------------+------------------+        findings_v8compat.json
   metadata                              |                            findings_app.json
   manifest                              v                            dashboard.html
   tie-out          1  DETERMINISTIC CORE        core/                coverage_manifest.json
   prior figures       footing, balance, ties,  no model, ever       ledger.json
   prior findings      roll-forward, ratios,                         telemetry.json
   sibling figures     workbook agreement                            skeptic_decisions.json
                                         |                           reconciler_decisions.json
                                         v                           escalation_log.json
                    2  JUDGMENT LAYER            judges/             rejected_findings.json
                       presentation, disclosure, behind              preparer_export.pdf
                       standards, comparative,   ModelAdapter        audit_file_export.pdf
                       regulatory
                                         |
                                         v
                    3  EVIDENCE LAYER            evidence/
                       corpus retrieval +
                       citation VERIFICATION (unverifiable = rejected)
                                         |
                                         v
                    4  ADVERSARIAL SKEPTIC       skeptic/
                       argues the contrary case on CRITICAL/HIGH
                                         |
                                         v
                       EDITOR                    reconcile/ render/
                       reconciler -> escalation -> voice annotation
                       -> suppression -> sort -> render
```

### Role 1: deterministic core (`core/`)

Pure Python, `Decimal`-exact, zero model involvement (CI greps for network and
model imports). Proves: section footing, balance-sheet balance, SOI-to-BS and
SOC-to-BS and SOC-to-SOO ties, roll-forward closure (total and per class),
SCF closure and BS tie, NAV per unit, expense and NII ratios within a
basis-point tolerance, and tie-out workbook agreement (line tolerance $1,
totals exact). Every break carries the exact relationship id, both sides, and
the delta. Severity follows the materiality rule: at or above planning
materiality CRITICAL, above clearly-trivial HIGH, below LOW; all CERTAIN by
construction. Relationship ids translate to the BASE CHECK-n/TIE-n/FEEDER-n
taxonomy via `schema/check_id_map.json`.

### Role 2: judgment layer (`judges/`)

Five reviewers carrying the v8 subagent remits: presentation (required
statements per framework, entity verification, L4 formatting conventions),
disclosure (checklist walk plus placeholder and ghost-text forensics),
standards (framework checklist with mandatory citations), comparative
(period-over-period materiality movements, feeder-to-master ties), regulatory
(jurisdiction checklist: CIMA, CSSF, SEC).

All reviewers run behind the **ModelAdapter** boundary:

| Adapter | What it is | When |
|---|---|---|
| `rule_based` | Deterministic Python rule execution | CI, the acceptance harness, and any run that must be reproducible |
| `claude` | The pinned production model path (MODEL_PIN recorded everywhere) | Production once integrated; HALTS loudly without credentials |

A run never silently downgrades adapters. The adapter that produced a finding
is stamped in its version block and in the run ledger.

### Role 3: evidence layer (`evidence/`)

Indexes the authority corpus (the v8 reference tree: ASC matrices and the
CIMA/SEC/IRS/Delaware regulatory corpus, plus v9 additions: IFRS matrices,
US GAAP supplement, CSSF). Citation keys are normalized so `ASC
820-10-50-2(c)` and `820-10-50-2C` resolve identically. The
**citation verifier** is a hard gate: a standards or regulatory finding whose
key does not resolve to real corpus text is rejected and logged: hallucinated
citations cannot reach a controller. A CI meta-test resolves every citation
used by every framework checklist, so corpus drift fails the build, not the
review.

### Role 4: adversarial skeptic (`skeptic/`)

Challenges every CRITICAL and HIGH judgment finding with three deterministic
strategies: synonym re-scan across all notes (catches title-pattern misses),
applicability re-verification from the figures, and deficiency-vs-absence
demotion (with a NO_DEMOTION list for substance checks like liquidation-basis
adoption, where note presence mitigates nothing). Core findings are never
challenged: arithmetic is not arguable. Effect is measured: the trap fixture
shows 3 false positives at baseline and 0 after the skeptic.

### Editor (`reconcile/`, `render/`)

- **Reconciler**: all patterns scored `trigger_count x severity_weight x
  scope_weight`; highest wins; constituents preserved in full inside the root
  cause; every decision, including losing candidates, logged.
- **Escalation** (BASE Stage 5f): prior-review matching on `merge_key`;
  RECURRING and REGRESSED escalate one severity tier; EVERGREEN_ACCEPTED
  carries forward and skips both escalation and the readiness count; cleared
  priors emit synthetic RESOLVED entries.
- **Voice annotation** (BASE Stage 5g, annotation mode): hedged CERTAIN text
  gets a polished alternative in `voiceNormalized`; the original is immutable;
  PROBABLE/POSSIBLE hedging is never stripped (stripping launders confidence).
- **Suppression**: clearly-trivial LOW findings are suppressed from the
  default view and the preparer export but retained in the trail and the
  audit file.
- **Render**: a self-contained dashboard (statement-grouped, severity and
  coverage readiness banner, CFO summary, chips, constituents toggle,
  disposition controls with undo, attribution footer, node-syntax-validated)
  and dual PDF exports from a dependency-free PDF writer.

## 3. The dual-schema strategy

v9 emits findings in three shapes per run, all derived from one internal form:

| File | Shape | Consumer |
|---|---|---|
| `findings.json` | v9 calibrated (source, confidence_calibrated, materiality, suppressed, nested versions) | v9 tooling, the harness, the learning loop |
| `findings_v8compat.json` | The BASE v8.1.1-rc schema, validated against the **vendored** BASE schema file every run and in the acceptance gate | Every existing v8 consumer: render.md surfaces, regression suites keyed to merge_key, BASE exports |
| `findings_app.json` | The shine-app dashboard import shape | The premium web dashboard in `../shine-app/` |

Nothing is lost between shapes; the compat projection is total and the
check-id translation is published (`schema/check_id_map.json`).

## 4. Reproducibility model

`ledger.json` is the identity record: a content hash of every input, the
config hash, every pinned version (engine, schema, adapter, MODEL_PIN, prompt
versions, corpus file hashes), and a digest of the results. It contains **no
timestamps**, so two runs on identical inputs produce byte-identical ledgers:
that equality is an acceptance-gate item, not an aspiration. Wall-clock and
latency live in `telemetry.json`, which is execution metadata, not identity.

## 5. Coverage and readiness (BASE invariant 17, v8.1.1 split)

- `scope_coverage_pct`: checked / (checked + degraded skips). Out-of-scope
  skips (NOT_APPLICABLE, SUBPOPULATION_ABSENT) do not count against scope;
  degraded ones (INPUT_MISSING) do, so a review missing its prior FS is
  honestly less covered.
- `applicability_documented_pct`: every skip carries a reason code. Anything
  silent is a control gap that blocks READY outright.
- READY requires: zero unresolved CRITICAL/HIGH (evergreen excluded), scope
  at or above 95 percent, applicability at 100 percent.

## 6. Invariants (the contract the engine keeps)

1. No model performs, checks, or overrides arithmetic. Anywhere.
2. No framework, fund, entity, or period is hardcoded. Metadata decides;
   absence halts.
3. Unverifiable citations never reach output.
4. Nothing is skipped, dropped, or degraded silently. Reason codes or halt.
5. Constituents survive every reconciliation, with the decision logged.
6. The original finding text is immutable; polish and edits live alongside.
7. Identical inputs produce identical results; any difference is explained by
   a recorded version delta.
8. Exports exclude DISCARDED, group by statement in FS page order, and carry
   the attribution footer.
9. Generated artifacts contain no em dashes (scanned in the gate).
10. Architect / Steward / Approver govern changes per the BASE OWNERSHIP doc.

## 7. Module map

```
run_review.py     orchestrator (thin)          run_batch.py   multi-fund batch
core/             arithmetic engine            frameworks/    ASC946 / IFRS / USGAAP + regulatory reqs
judges/           5 reviewers + adapter        evidence/      corpus + retrieval + verifier
skeptic/          adversarial pass             reconcile/     reconciler, escalation, voice, suppression
render/           dashboard + PDF exports      ingest/        discovery (local + Box), outputs writer
ledger/           run ledger, telemetry,       schema/        v9 schema + validator, BASE compat
                  disposition loop                            projection + vendored BASE schema
harness/          fixture factory, golden      golden/        34 fixtures incl. TC-01..08
                  generator, acceptance runner tests/         126-test unit suite
config/           thresholds, materiality, roles, adapter, MODEL_PIN
```

## 8. Design decisions and trade-offs (recorded)

- **Figures enter structured.** The engine consumes `figures.json` plus a
  machine-readable tie-out, not raw PDF. Extraction is an upstream adapter by
  design: extracted figures must reconcile against the tie-out before use, so
  extraction errors surface as tie-out breaks, never as silent inputs.
- **Sequential judge dispatch.** The BASE runs Phase 1 in parallel for model
  latency; in rule_based mode latency is microseconds and determinism wins.
  A model adapter may parallelize inside `run_reviewer` without changing the
  contract.
- **Escalation runs after reconciliation**, so recurrence applies to the
  surviving population; root-cause merge_keys are the escalation keys.
- **`ingest/` not `io/`**: a top-level `io` package shadows the Python stdlib.
- **Two output modes**: `simple` (deterministic, harness) and `audit_tree`
  (the BASE `{root}/_outputs/{path}/{reviewer}-{stamp}/` convention for
  production, where run collision-proofing beats byte-determinism of paths).
