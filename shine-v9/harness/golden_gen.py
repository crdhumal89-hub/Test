"""Golden library generator. Deterministic, reviewable, re-runnable.

Each fixture folder = inputs/ (figures, notes, metadata, manifest) plus
expected_findings.json: the recorded expected-finding manifest with must_catch
flags. Defects are seeded with their FULL blast radius enumerated, because an
emitted finding the manifest does not expect counts as a false positive.

Usage: python3 -m harness.golden_gen
"""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from harness.fixture_factory import (make_clean_review, mutate,           # noqa: E402
                                     write_review_folder)

GOLDEN = ROOT / "golden"


def expected(category, *, relationship=None, check_id=None, must_catch=False,
             note="", recurrence=None, severity=None):
    return {"category": category, "relationship": relationship,
            "check_id": check_id, "must_catch": must_catch, "note": note,
            "recurrence": recurrence, "severity": severity}


def build_fixtures() -> dict[str, tuple[dict, list[dict]]]:
    fixtures: dict[str, tuple[dict, list[dict]]] = {}

    # ---- clean drafts: zero findings expected ----
    fixtures["clean_asc946"] = (make_clean_review("ASC946"), [])
    fixtures["clean_ifrs"] = (make_clean_review("IFRS"), [])
    fixtures["clean_usgaap"] = (make_clean_review("USGAAP"), [])

    multi = make_clean_review("ASC946")
    multi["metadata"]["linked_entities"] = [
        {"code": "FEEDER-A", "relationship": "feeder", "ownership_pct": 1.0}]
    multi["sibling_figures"] = {
        "entity": {"fund_code": "FEEDER-A"},
        "balance_sheet": {"assets": {"investment_in_master": 103000000.0}}}
    fixtures["clean_multi_entity"] = (multi, [])

    # ---- skeptic traps: must stay clean ----
    trap = make_clean_review("ASC946")
    for note in trap["notes"]["notes"]:
        if "Fair value" in note["title"]:
            note["title"] = "Valuation"   # title pattern miss; content complete
    fixtures["trap_synonym_valuation_note"] = (trap, [])

    trap2 = make_clean_review("ASC946")   # no derivatives held: item not applicable
    fixtures["trap_no_derivatives"] = (trap2, [])

    # ---- arithmetic defects (deterministic core, must catch) ----
    b = make_clean_review("ASC946")
    b["figures"] = mutate(b["figures"], "balance_sheet.assets.receivables", 2400000.0)
    fixtures["arith_assets_footing"] = (b, [
        expected("footing_break", relationship="BS_ASSETS_FOOT", must_catch=True,
                 note="component line misstated by 400k; asset section does not foot")])

    b = make_clean_review("ASC946")
    b["figures"] = mutate(b["figures"], "balance_sheet.partners_capital", 104000000.0)
    fixtures["arith_bs_imbalance"] = (b, [
        expected("balance_break", relationship="BS_BALANCE", must_catch=True,
                 note="statement does not balance by 1M"),
        expected("tie_out_break", relationship="SOC_TO_BS",
                 note="cascade: SOC ending no longer ties to BS capital"),
        expected("tie_out_break", relationship="TIE_OUT:balance_sheet.partners_capital",
                 note="cascade: workbook carries the correct capital"),
        expected("per_unit_break", relationship="FH_NAV_PER_UNIT",
                 note="cascade: NAV per unit recomputes against misstated capital")])

    b = make_clean_review("ASC946")
    b["figures"] = mutate(b["figures"], "schedule_of_investments.total_fair_value", 100500000.0)
    fixtures["arith_soi_bs_tie"] = (b, [
        expected("tie_out_break", relationship="SOI_TO_BS", must_catch=True,
                 note="schedule total does not tie to BS investments"),
        expected("footing_break", relationship="SOI_POSITIONS_FOOT_FV",
                 note="cascade: positions no longer foot to the misstated total"),
        expected("footing_break", relationship="SOI_LEVELS_FOOT",
                 note="cascade: levels no longer foot to the misstated total"),
        expected("tie_out_break", relationship="TIE_OUT:schedule_of_investments.total_fair_value",
                 note="cascade: workbook carries the correct total")])

    b = make_clean_review("ASC946")
    b["figures"] = mutate(b["figures"], "statement_of_changes.contributions", 9500000.0)
    fixtures["arith_rollforward"] = (b, [
        expected("rollforward_break", relationship="SOC_CLOSURE", must_catch=True,
                 note="roll-forward does not close by 500k")])

    b = make_clean_review("ASC946")
    b["figures"] = mutate(b["figures"], "financial_highlights.nav_per_unit", 104.0)
    fixtures["arith_nav_per_unit"] = (b, [
        expected("per_unit_break", relationship="FH_NAV_PER_UNIT", must_catch=True,
                 note="stated NAV per unit does not recompute")])

    b = make_clean_review("ASC946")
    b["figures"] = mutate(b["figures"], "financial_highlights.expense_ratio", 0.045)
    fixtures["arith_expense_ratio"] = (b, [
        expected("ratio_break", relationship="FH_EXPENSE_RATIO", must_catch=True,
                 note="stated expense ratio off by ~87 bps")])

    b = make_clean_review("ASC946")
    b["figures"]["tie_out"]["statement_of_changes.ending_capital"] = 102900000.0
    fixtures["arith_tie_out_mismatch"] = (b, [
        expected("tie_out_break", relationship="TIE_OUT:statement_of_changes.ending_capital",
                 must_catch=True, note="workbook and statement disagree by 100k")])

    b = make_clean_review("ASC946")
    b["figures"] = mutate(b["figures"], "statement_of_operations.investment_income.interest", 8300000.0)
    fixtures["arith_income_footing"] = (b, [
        expected("footing_break", relationship="SOO_INCOME_FOOT", must_catch=True,
                 note="income lines foot 300k above the stated total")])

    # ---- presentation defects ----
    b = make_clean_review("ASC946")
    del b["figures"]["financial_highlights"]
    fixtures["pres_missing_highlights"] = (b, [
        expected("presentation_gap", check_id=None, must_catch=True,
                 note="financial highlights are a required ASC 946 statement")])

    b = make_clean_review("IFRS")
    b["figures"]["cash_flows"] = {"present": False}
    fixtures["pres_missing_scf_ifrs"] = (b, [
        expected("presentation_gap", must_catch=True,
                 note="cash flow statement is required under IAS 1, no election out")])

    b = make_clean_review("ASC946")
    b["figures"] = mutate(b["figures"], "entity.legal_name", "Golden Fund III LP")
    fixtures["pres_wrong_entity_name"] = (b, [
        expected("entity_mismatch", must_catch=True,
                 note="statements carry the wrong fund's name")])

    # ---- disclosure and standards defects ----
    b = make_clean_review("ASC946")
    b["notes"]["notes"] = [n for n in b["notes"]["notes"] if "Fair value" not in n["title"]]
    fixtures["disc_missing_fv_note_asc"] = (b, [
        expected("standards_gap", check_id="ASC946_HIERARCHY_TABLE", must_catch=True,
                 note="no leveling disclosure anywhere"),
        expected("standards_gap", check_id="ASC946_LEVEL3_ROLLFORWARD", must_catch=True,
                 note="no Level 3 reconciliation anywhere"),
        expected("standards_gap", check_id="ASC946_LEVEL3_INPUTS",
                 note="no unobservable inputs disclosure anywhere")])

    b = make_clean_review("ASC946")
    b["notes"]["notes"][1]["text"] += " Valuation of [TBD] remains under discussion."
    fixtures["disc_placeholder"] = (b, [
        expected("placeholder_text", must_catch=True,
                 note="unresolved TBD marker in the policies note")])

    b = make_clean_review("ASC946")
    b["figures"]["schedule_of_investments"]["positions"][0]["name"] = "Other investments (aggregated)"
    fixtures["std_concentration_5pct"] = (b, [
        expected("standards_gap", check_id="ASC946_CONCENTRATION_5PCT", must_catch=True,
                 note="38.8 percent of capital aggregated without name-level disclosure")])

    b = make_clean_review("IFRS")
    b["notes"]["notes"] = [n for n in b["notes"]["notes"] if "Fair value" not in n["title"]]
    fixtures["std_ifrs_missing_fv"] = (b, [
        expected("standards_gap", check_id="IFRS13_HIERARCHY", must_catch=True,
                 note="IFRS 13.93 hierarchy disclosures absent"),
        expected("standards_gap", check_id="IFRS13_LEVEL3_RECON", must_catch=True,
                 note="IFRS 13.93(e) reconciliation absent")])

    # ---- regulatory defects ----
    b = make_clean_review("ASC946")
    b["notes"]["notes"][0]["text"] = (
        "Golden Fund A LP (the Fund) is a closed-end investment vehicle. "
        "The Fund distributes annual audited financial statements to all investors.")
    fixtures["reg_cayman_missing_pfa"] = (b, [
        expected("regulatory_gap", check_id="REG_CIMA_PFA", must_catch=True,
                 note="post-2020 Cayman fund without PFA registration reference")])

    b = make_clean_review("IFRS")
    b["notes"]["notes"][0]["text"] = (
        "Golden Fund A LP (the Fund) is a Luxembourg vehicle. "
        "The Fund distributes annual audited financial statements to all investors.")
    fixtures["reg_lux_missing_cssf"] = (b, [
        expected("regulatory_gap", check_id="REG_LUX_CSSF",
                 note="Luxembourg vehicle without CSSF supervision reference")])

    # ---- comparative defects ----
    b = make_clean_review("ASC946")
    prior = copy.deepcopy(b["figures"])
    prior["balance_sheet"]["assets"]["investments_at_fair_value"] = 60000000.0
    b["prior_figures"] = prior
    fixtures["comp_unexplained_movement"] = (b, [
        expected("comparative_movement", must_catch=True,
                 note="40M investments movement with no explaining narrative")])

    b = make_clean_review("ASC946")
    b["metadata"]["linked_entities"] = [
        {"code": "FEEDER-A", "relationship": "feeder", "ownership_pct": 1.0}]
    b["sibling_figures"] = {
        "entity": {"fund_code": "FEEDER-A"},
        "balance_sheet": {"assets": {"investment_in_master": 101000000.0}}}
    fixtures["comp_feeder_break"] = (b, [
        expected("inter_entity_break", must_catch=True,
                 note="feeder carries master interest 2M below master capital")])

    # ---- reconciler cluster: core break + standards gap collapse to a root ----
    b = make_clean_review("ASC946")
    b["figures"]["schedule_of_investments"]["level_totals"]["3"] = 55000000.0
    for note in b["notes"]["notes"]:
        if "Fair value" in note["title"]:
            note["text"] = ("The Fund categorizes fair value measurements into Level 1, "
                            "Level 2 and Level 3 inputs. Significant unobservable inputs "
                            "include market multiples and discount rates, with ranges and "
                            "weighted averages disclosed.")
    fixtures["cluster_level3"] = (b, [
        expected("footing_break", relationship="SOI_LEVELS_FOOT", must_catch=True,
                 note="leveling table does not foot; satisfied via reconciler constituent"),
        expected("standards_gap", check_id="ASC946_LEVEL3_ROLLFORWARD", must_catch=True,
                 note="reconciliation language gutted; satisfied via reconciler constituent")])

    # ================= BASE regression taxonomy: TC-01 through TC-08 =========
    # The v8.1.1-rc regression-test-suite-spec names eight production cases
    # keyed to historical reviews. These synthesize each case's FAILURE MODE
    # against the fixture factory; the mapping to the BASE taxonomy is recorded
    # in golden/REGRESSION-TC.md. When historical review data is available,
    # the steward replaces the synthetic inputs and keeps the expected shapes.

    # TC-01 Co-Investors-A-Draft-1.1: placeholder cluster + prior FS + grouping.
    b = make_clean_review("ASC946")
    b["notes"]["notes"][1]["text"] += " Carry waterfall description [TBD] pending counsel."
    prior = copy.deepcopy(b["figures"])
    prior["balance_sheet"]["assets"]["investments_at_fair_value"] = 55000000.0
    b["prior_figures"] = prior
    fixtures["tc01_coinvestors_a"] = (b, [
        expected("placeholder_text", must_catch=True,
                 note="TC-01: unresolved placeholder in policies note"),
        expected("comparative_movement", must_catch=True,
                 note="TC-01: 45M unexplained investments movement vs prior FS")])

    # TC-02 ST-Fund-USD-Rev-2-to-3: workbook reconciliation + RECURRING and
    # REGRESSED prior-review escalation.
    b = make_clean_review("ASC946")
    b["figures"]["tie_out"]["statement_of_changes.ending_capital"] = 102900000.0
    b["figures"] = mutate(b["figures"], "statement_of_operations.expenses.other", 700000.0)
    b["prior_findings"] = [
        {"merge_key": "Tie-Out Workbook::Tie-out workbook::ending_capital::tie_out_break",
         "state": "ACCEPTED"},
        {"merge_key": "Statement of Operations::Expenses::Total expenses::footing_break",
         "state": "RESOLVED"},
    ]
    fixtures["tc02_st_fund_rev_2_to_3"] = (b, [
        expected("tie_out_break", relationship="TIE_OUT:statement_of_changes.ending_capital",
                 must_catch=True, recurrence="RECURRING", severity="CRITICAL",
                 note="TC-02: workbook mismatch flagged last review and not fixed; escalates"),
        expected("footing_break", relationship="SOO_EXPENSES_FOOT",
                 must_catch=True, recurrence="REGRESSED",
                 note="TC-02: previously resolved expense footing break recurs")])

    # TC-03 Master-Fund-Clean-Draft: low-density baseline; no fabrication.
    fixtures["tc03_master_fund_clean"] = (make_clean_review("ASC946"), [])

    # TC-04 FOF-First-Year: NAV practical expedient applicability.
    b = make_clean_review("ASC946")
    b["figures"]["schedule_of_investments"]["positions"][2] = {
        "name": "Underlying Fund Interests", "industry": "Funds", "type": "fund",
        "fair_value": 10000000.0, "cost": 8000000.0, "level": 3}
    b["figures"]["schedule_of_investments"]["level_totals"] = {"1": 0.0, "2": 30000000.0, "3": 70000000.0}
    fixtures["tc04_fof_first_year"] = (b, [
        expected("standards_gap", check_id="ASC946_NAV_PE", must_catch=True,
                 note="TC-04: fund interests held without NAV practical expedient disclosures")])

    # TC-05 Aggregator-with-Feeders: inter-entity reconciliation break.
    b = make_clean_review("ASC946")
    b["metadata"]["linked_entities"] = [
        {"code": "FEEDER-USD", "relationship": "feeder", "ownership_pct": 1.0}]
    b["sibling_figures"] = {
        "entity": {"fund_code": "FEEDER-USD"},
        "balance_sheet": {"assets": {"investment_in_master": 101500000.0}}}
    fixtures["tc05_aggregator_feeders"] = (b, [
        expected("inter_entity_break", must_catch=True,
                 note="TC-05: feeder carries master interest 1.5M below master capital")])

    # TC-06 Liquidating-Fund: liquidation basis adoption missing.
    b = make_clean_review("ASC946")
    b["metadata"]["liquidating"] = True
    fixtures["tc06_liquidating_fund"] = (b, [
        expected("standards_gap", check_id="ASC946_LIQUIDATION_BASIS", must_catch=True,
                 severity="CRITICAL",
                 note="TC-06: liquidation imminent but liquidation basis not adopted or disclosed")])

    # TC-07 Restatement-Year: ASC 250 transition disclosure missing.
    b = make_clean_review("ASC946")
    b["metadata"]["policy_change_in_period"] = True
    fixtures["tc07_restatement_year"] = (b, [
        expected("standards_gap", check_id="ASC946_ASC250_TRANSITION", must_catch=True,
                 note="TC-07: policy change in period without ASC 250 transition disclosures")])

    # TC-08 Cross-Border-Lux-Sarl: CSSF regulatory exposure under IFRS.
    b = make_clean_review("IFRS")
    b["notes"]["notes"][0]["text"] = (
        "Golden Fund A LP (the Fund) is a Luxembourg societe a responsabilite limitee. "
        "The Fund distributes annual audited financial statements to all investors.")
    fixtures["tc08_lux_sarl"] = (b, [
        expected("regulatory_gap", check_id="REG_LUX_CSSF", must_catch=True,
                 note="TC-08: Lux SARL without CSSF supervision and RCS filing reference")])

    return fixtures


def main() -> int:
    fixtures = build_fixtures()
    GOLDEN.mkdir(exist_ok=True)
    for name, (bundle, expected_list) in sorted(fixtures.items()):
        folder = GOLDEN / name
        write_review_folder(folder, bundle)
        (folder / "expected_findings.json").write_text(
            json.dumps(expected_list, sort_keys=True, indent=1) + "\n", encoding="utf-8")
    print(f"golden library: {len(fixtures)} fixtures written to {GOLDEN}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
