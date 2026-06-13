"""Phase 1 suite: the deterministic core.

Discipline: a clean fixture produces ZERO breaks; every planted defect is
caught with the EXACT failing relationship and the exact delta. This suite is
intentionally the largest in the repo because the core is the reliability
backbone of the engine.
"""
import sys
import unittest
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.checks import run_all                      # noqa: E402
from core.engine import run_core                     # noqa: E402
from harness.fixture_factory import make_clean_figures, mutate  # noqa: E402

TOL = {"line_abs": 1.0, "total_abs": 0.01, "ratio_bps": 5.0, "per_unit_abs": 0.01, "inter_entity_abs": 1.0}


def break_relationships(figures):
    return [b.relationship for b in run_all(figures, TOL).breaks]


class CleanFixture(unittest.TestCase):
    def test_clean_figures_produce_zero_breaks(self):
        result = run_all(make_clean_figures(), TOL)
        self.assertEqual([], [(b.relationship, str(b.delta)) for b in result.breaks])

    def test_clean_figures_cover_all_relationships(self):
        result = run_all(make_clean_figures(), TOL)
        expected_min = {
            "BS_ASSETS_FOOT", "BS_LIABS_FOOT", "BS_BALANCE",
            "SOI_POSITIONS_FOOT_FV", "SOI_POSITIONS_FOOT_COST", "SOI_LEVELS_FOOT", "SOI_TO_BS",
            "SOO_INCOME_FOOT", "SOO_EXPENSES_FOOT", "SOO_NII", "SOO_NET_INCREASE",
            "SOC_CLOSURE", "SOC_ALLOC_TO_SOO", "SOC_TO_BS", "SOC_CLASS_FOOT",
            "SCF_CLOSURE", "SCF_TO_BS",
            "FH_NAV_PER_UNIT", "FH_EXPENSE_RATIO", "FH_NII_RATIO",
        }
        self.assertTrue(expected_min.issubset(set(result.checked)),
                        f"missing: {expected_min - set(result.checked)}")

    def test_no_silent_skips_on_clean_fixture(self):
        result = run_all(make_clean_figures(), TOL)
        for skip in result.skipped:
            self.assertIn("reason_code", skip)
            self.assertIn("reason", skip)


class BalanceSheetDefects(unittest.TestCase):
    def test_asset_footing_break_caught_with_exact_delta(self):
        figures = mutate(make_clean_figures(), "balance_sheet.assets.total_assets", 108000500.0)
        result = run_all(figures, TOL)
        rels = {b.relationship: b for b in result.breaks}
        self.assertIn("BS_ASSETS_FOOT", rels)
        self.assertEqual(Decimal("-500.0"), rels["BS_ASSETS_FOOT"].delta)
        # the imbalance also surfaces in BS_BALANCE and the tie-out, never silently
        self.assertIn("BS_BALANCE", rels)

    def test_balance_break_caught(self):
        figures = mutate(make_clean_figures(), "balance_sheet.partners_capital", 104000000.0)
        rels = break_relationships(figures)
        self.assertIn("BS_BALANCE", rels)
        self.assertIn("SOC_TO_BS", rels)  # downstream tie breaks too

    def test_liability_footing_break_caught(self):
        figures = mutate(make_clean_figures(), "balance_sheet.liabilities.payables", 3100000.0)
        rels = break_relationships(figures)
        self.assertIn("BS_LIABS_FOOT", rels)


class SOIDefects(unittest.TestCase):
    def test_soi_position_footing_break(self):
        figures = make_clean_figures()
        figures["schedule_of_investments"]["positions"][0]["fair_value"] = 40500000.0
        result = run_all(figures, TOL)
        rels = {b.relationship: b for b in result.breaks}
        self.assertIn("SOI_POSITIONS_FOOT_FV", rels)
        self.assertEqual(Decimal("500000.0"), rels["SOI_POSITIONS_FOOT_FV"].delta)

    def test_soi_to_bs_tie_break(self):
        figures = mutate(make_clean_figures(), "schedule_of_investments.total_fair_value", 100500000.0)
        rels = break_relationships(figures)
        self.assertIn("SOI_TO_BS", rels)
        self.assertIn("SOI_POSITIONS_FOOT_FV", rels)

    def test_level_totals_break(self):
        figures = make_clean_figures()
        figures["schedule_of_investments"]["level_totals"]["3"] = 59000000.0
        rels = break_relationships(figures)
        self.assertIn("SOI_LEVELS_FOOT", rels)

    def test_cost_footing_break(self):
        figures = mutate(make_clean_figures(), "schedule_of_investments.total_cost", 81000000.0)
        rels = break_relationships(figures)
        self.assertIn("SOI_POSITIONS_FOOT_COST", rels)


class SOODefects(unittest.TestCase):
    def test_income_footing_break(self):
        figures = mutate(make_clean_figures(), "statement_of_operations.investment_income.total", 10250000.0)
        rels = break_relationships(figures)
        self.assertIn("SOO_INCOME_FOOT", rels)
        self.assertIn("SOO_NII", rels)  # NII recomputes against the stated total

    def test_expense_footing_break(self):
        figures = mutate(make_clean_figures(), "statement_of_operations.expenses.other", 700000.0)
        rels = break_relationships(figures)
        self.assertIn("SOO_EXPENSES_FOOT", rels)

    def test_net_increase_break(self):
        figures = mutate(make_clean_figures(), "statement_of_operations.net_increase_in_partners_capital", 17000000.0)
        result = run_all(figures, TOL)
        rels = {b.relationship: b for b in result.breaks}
        self.assertIn("SOO_NET_INCREASE", rels)
        self.assertEqual(Decimal("-500000.0"), rels["SOO_NET_INCREASE"].delta)


class SOCDefects(unittest.TestCase):
    def test_rollforward_closure_break(self):
        figures = mutate(make_clean_figures(), "statement_of_changes.contributions", 9000000.0)
        rels = break_relationships(figures)
        self.assertIn("SOC_CLOSURE", rels)

    def test_class_closure_break(self):
        figures = make_clean_figures()
        figures["statement_of_changes"]["by_class"][0]["ending"] = 68250000.0
        rels = break_relationships(figures)
        self.assertIn("SOC_CLASS_CLOSURE", rels)
        self.assertIn("SOC_CLASS_FOOT", rels)

    def test_allocation_tie_to_soo(self):
        figures = mutate(make_clean_figures(), "statement_of_changes.allocation_net_increase", 16000000.0)
        rels = break_relationships(figures)
        self.assertIn("SOC_ALLOC_TO_SOO", rels)
        self.assertIn("SOC_CLOSURE", rels)


class SCFDefects(unittest.TestCase):
    def test_cash_closure_break(self):
        figures = mutate(make_clean_figures(), "cash_flows.net_change_in_cash", 2000000.0)
        rels = break_relationships(figures)
        self.assertIn("SCF_CLOSURE", rels)

    def test_cash_to_bs_break(self):
        figures = mutate(make_clean_figures(), "cash_flows.ending_cash", 6000000.0)
        rels = break_relationships(figures)
        self.assertIn("SCF_TO_BS", rels)

    def test_elected_out_scf_records_skip_not_break(self):
        figures = make_clean_figures()
        figures["cash_flows"] = {"present": False}
        result = run_all(figures, TOL)
        self.assertEqual([], [b for b in result.breaks if b.relationship.startswith("SCF")])
        scf_skips = [s for s in result.skipped if s["relationship"].startswith("SCF")]
        self.assertEqual(2, len(scf_skips))
        self.assertTrue(all(s["reason_code"] == "SUBPOPULATION_ABSENT" for s in scf_skips))


class HighlightsDefects(unittest.TestCase):
    def test_nav_per_unit_break(self):
        figures = mutate(make_clean_figures(), "financial_highlights.nav_per_unit", 104.0)
        result = run_all(figures, TOL)
        rels = {b.relationship: b for b in result.breaks}
        self.assertIn("FH_NAV_PER_UNIT", rels)
        self.assertEqual(Decimal("-1.0"), rels["FH_NAV_PER_UNIT"].delta)

    def test_expense_ratio_break_beyond_bps_tolerance(self):
        figures = mutate(make_clean_figures(), "financial_highlights.expense_ratio", 0.040)
        rels = break_relationships(figures)
        self.assertIn("FH_EXPENSE_RATIO", rels)

    def test_expense_ratio_within_tolerance_passes(self):
        # 1 bp away from the computed value: inside the 5 bps tolerance.
        figures = mutate(make_clean_figures(), "financial_highlights.expense_ratio", 0.036369)
        rels = break_relationships(figures)
        self.assertNotIn("FH_EXPENSE_RATIO", rels)

    def test_nii_ratio_break(self):
        figures = mutate(make_clean_figures(), "financial_highlights.nii_ratio", 0.075)
        rels = break_relationships(figures)
        self.assertIn("FH_NII_RATIO", rels)


class TieOutDefects(unittest.TestCase):
    def test_tie_out_mismatch_caught(self):
        figures = make_clean_figures()
        figures["tie_out"]["statement_of_changes.ending_capital"] = 102900000.0
        result = run_all(figures, TOL)
        hits = [b for b in result.breaks if b.relationship == "TIE_OUT:statement_of_changes.ending_capital"]
        self.assertEqual(1, len(hits))
        self.assertEqual(Decimal("100000.0"), hits[0].delta)

    def test_line_tolerance_allows_rounding_dollar(self):
        figures = make_clean_figures()
        figures["tie_out"]["balance_sheet.assets.receivables"] = 2000000.6  # within line_abs 1.0
        result = run_all(figures, TOL)
        hits = [b for b in result.breaks if b.relationship.startswith("TIE_OUT:balance_sheet.assets.receivables")]
        self.assertEqual([], hits)

    def test_missing_tie_out_records_skip(self):
        figures = make_clean_figures()
        del figures["tie_out"]
        result = run_all(figures, TOL)
        skips = [s for s in result.skipped if s["relationship"] == "TIE_OUT"]
        self.assertEqual(1, len(skips))
        self.assertEqual("INPUT_MISSING", skips[0]["reason_code"])


class _StubFramework:
    code = "ASC946"
    _names = {
        "balance_sheet": "Statement of Assets and Liabilities",
        "soi": "Schedule of Investments", "soo": "Statement of Operations",
        "soc": "Statement of Changes in Partners Capital", "scf": "Statement of Cash Flows",
        "highlights": "Financial Highlights", "tie_out": "Tie-Out Workbook",
    }

    def statement_name(self, key):
        return self._names.get(key, key)


class FindingConversion(unittest.TestCase):
    CONFIG = {
        "tolerances": TOL,
        "materiality": {"default_planning_pct_of_nav": 0.0075, "clearly_trivial_pct_of_materiality": 0.05},
    }
    VERSIONS = {"engine": "9.0.0", "schema": "9.0", "adapter": "rule_based", "model_pin": "claude-fable-5"}

    def test_material_break_is_critical_certain(self):
        # materiality = 103M * 0.0075 = 772,500; plant a 1M break.
        figures = mutate(make_clean_figures(), "statement_of_changes.ending_capital", 104000000.0)
        findings, _ = run_core(figures, self.CONFIG, _StubFramework(), self.VERSIONS)
        closure = [x for x in findings if x["evidence"]["relationship"] == "SOC_CLOSURE"]
        self.assertEqual(1, len(closure))
        self.assertEqual("CRITICAL", closure[0]["severity"])
        self.assertEqual("CERTAIN", closure[0]["confidence_label"])
        self.assertEqual("core", closure[0]["source"])

    def test_mid_size_break_is_high(self):
        # between trivial (38,625) and materiality (772,500): plant 100,000.
        figures = make_clean_figures()
        figures["tie_out"]["statement_of_changes.ending_capital"] = 102900000.0
        findings, _ = run_core(figures, self.CONFIG, _StubFramework(), self.VERSIONS)
        hits = [x for x in findings if x["evidence"]["relationship"].startswith("TIE_OUT:")]
        self.assertEqual(1, len(hits))
        self.assertEqual("HIGH", hits[0]["severity"])

    def test_trivial_break_is_low_and_flagged_trivial(self):
        # below trivial threshold 38,625: plant 500.
        figures = mutate(make_clean_figures(), "balance_sheet.assets.total_assets", 108000500.0)
        findings, _ = run_core(figures, self.CONFIG, _StubFramework(), self.VERSIONS)
        foot = [x for x in findings if x["evidence"]["relationship"] == "BS_ASSETS_FOOT"]
        self.assertEqual("LOW", foot[0]["severity"])
        self.assertTrue(foot[0]["materiality"]["clearly_trivial"])

    def test_findings_carry_exact_numbers_and_versions(self):
        figures = mutate(make_clean_figures(), "balance_sheet.partners_capital", 104000000.0)
        findings, _ = run_core(figures, self.CONFIG, _StubFramework(), self.VERSIONS)
        bal = [x for x in findings if x["evidence"]["relationship"] == "BS_BALANCE"][0]
        self.assertEqual(108000000.0, bal["evidence"]["lhs"])
        self.assertEqual(109000000.0, bal["evidence"]["rhs"])
        self.assertEqual(-1000000.0, bal["evidence"]["delta"])
        self.assertEqual("claude-fable-5", bal["versions"]["model_pin"])

    def test_coverage_accounts_for_every_relationship(self):
        figures = make_clean_figures()
        _, coverage = run_core(figures, self.CONFIG, _StubFramework(), self.VERSIONS)
        self.assertGreaterEqual(len(coverage["checked"]), 20)


if __name__ == "__main__":
    unittest.main()
