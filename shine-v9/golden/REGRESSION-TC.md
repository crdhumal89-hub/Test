# Regression taxonomy mapping: BASE TC-01..TC-08 to v9 fixtures

The v8.1.1-rc `regression-test-suite-spec.md` names eight production test
cases keyed to historical Apollo reviews. v9 synthesizes each case's failure
mode so the suite runs in CI without production data. When a historical
review is exported (per the BASE spec's Box `_REGRESSION/` convention), the
steward replaces the synthetic inputs and keeps the expected-finding shape.

| BASE case | v9 fixture | Failure mode covered | Synthetic vs historical |
|---|---|---|---|
| TC-01 Co-Investors-A-Draft-1.1 | `tc01_coinvestors_a` | Placeholder cluster, prior-FS comparative movement, statement grouping | Synthetic |
| TC-02 ST-Fund-USD-Rev-2-to-3 | `tc02_st_fund_rev_2_to_3` | Workbook reconciliation (XLSX-1), prior-review escalation RECURRING and REGRESSED | Synthetic |
| TC-03 Master-Fund-Clean-Draft | `tc03_master_fund_clean` | Clean-draft baseline; zero fabricated findings (stricter than the BASE "<5 findings" bar) | Synthetic |
| TC-04 FOF-First-Year | `tc04_fof_first_year` | NAV practical expedient applicability (ASC 820-10-50-6A) on fund interests | Synthetic |
| TC-05 Aggregator-with-Feeders | `tc05_aggregator_feeders` | Inter-entity feeder-to-master reconciliation (FEEDER-1) | Synthetic |
| TC-06 Liquidating-Fund | `tc06_liquidating_fund` | Liquidation basis adoption (ASC 205-30); also pinned the skeptic NO_DEMOTION rule | Synthetic |
| TC-07 Restatement-Year | `tc07_restatement_year` | ASC 250 transition disclosure on a policy-change year | Synthetic |
| TC-08 Cross-Border-Lux-Sarl | `tc08_lux_sarl` | CSSF supervision exposure under IFRS for a Lux SARL | Synthetic |

Known coverage deltas against the BASE spec, tracked for the historical
replacement pass: TC-02 hidden-Excel-row scenarios run as workbook tie-out
mismatches (structured-figures equivalent); TC-04 FOF SOI hierarchy and
period-description checks are roadmap items; TC-05 runs one feeder, the BASE
case names two.

Regenerate the library any time with `python3 -m harness.golden_gen`; score
with `python3 -m harness.runner`.
