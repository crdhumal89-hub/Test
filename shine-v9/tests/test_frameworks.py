"""Phase 3 suite: framework selection and divergence between engines."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from frameworks.registry import select_framework            # noqa: E402
from frameworks.base import FrameworkError, derive_flags     # noqa: E402
from frameworks.regulatory_reqs import build_regulatory_checklist  # noqa: E402
from harness.fixture_factory import make_clean_figures, make_metadata  # noqa: E402


class Selection(unittest.TestCase):
    def test_metadata_selects_each_framework_without_code_change(self):
        for code in ("ASC946", "IFRS", "USGAAP"):
            engine = select_framework(make_metadata(code))
            self.assertEqual(code, engine.code)

    def test_missing_framework_halts_not_defaults(self):
        metadata = make_metadata()
        del metadata["presentation"]["framework"]
        with self.assertRaises(FrameworkError):
            select_framework(metadata)

    def test_unknown_framework_halts(self):
        metadata = make_metadata()
        metadata["presentation"]["framework"] = "LUXGAAP"
        with self.assertRaises(FrameworkError):
            select_framework(metadata)


class Divergence(unittest.TestCase):
    def test_scf_elective_under_asc946_required_under_ifrs(self):
        figures = make_clean_figures()
        asc = {r["canonical_key"]: r for r in select_framework(make_metadata("ASC946")).required_statements(figures)}
        ifrs = {r["canonical_key"]: r for r in select_framework(make_metadata("IFRS")).required_statements(figures)}
        self.assertFalse(asc["scf"]["required"])
        self.assertTrue(ifrs["scf"]["required"])

    def test_statement_names_follow_framework(self):
        asc = select_framework(make_metadata("ASC946"))
        ifrs = select_framework(make_metadata("IFRS"))
        self.assertEqual("Statement of Assets and Liabilities", asc.statement_name("balance_sheet"))
        self.assertEqual("Statement of Financial Position", ifrs.statement_name("balance_sheet"))

    def test_standards_items_always_carry_citations(self):
        figures = make_clean_figures()
        for code in ("ASC946", "IFRS", "USGAAP"):
            engine = select_framework(make_metadata(code))
            for it in engine.checklist(figures, make_metadata(code)):
                if it["kind"] == "standards":
                    self.assertTrue(it["citation_key"], f"{it['check_id']} lacks a citation key")


class Applicability(unittest.TestCase):
    def test_no_derivatives_means_derivative_item_not_applicable(self):
        figures = make_clean_figures()
        engine = select_framework(make_metadata("ASC946"))
        items = {i["check_id"]: i for i in engine.checklist(figures, make_metadata())}
        self.assertFalse(items["ASC946_DERIVATIVES_VOLUME"]["applicable"])

    def test_derivative_position_flips_applicability(self):
        figures = make_clean_figures()
        figures["schedule_of_investments"]["positions"].append(
            {"name": "Zeta Swap", "industry": "Financials", "type": "derivative",
             "fair_value": 0.0, "cost": 0.0, "level": 2})
        engine = select_framework(make_metadata("ASC946"))
        items = {i["check_id"]: i for i in engine.checklist(figures, make_metadata())}
        self.assertTrue(items["ASC946_DERIVATIVES_VOLUME"]["applicable"])

    def test_aggregated_position_over_5pct_creates_concentration_item(self):
        figures = make_clean_figures()
        figures["schedule_of_investments"]["positions"][0] = {
            "name": "Other investments (aggregated)", "industry": "Various", "type": "equity",
            "fair_value": 40000000.0, "cost": 30000000.0, "level": 3}
        engine = select_framework(make_metadata("ASC946"))
        ids = [i["check_id"] for i in engine.checklist(figures, make_metadata())]
        self.assertIn("ASC946_CONCENTRATION_5PCT", ids)

    def test_flags_derivation(self):
        flags = derive_flags(make_clean_figures())
        self.assertTrue(flags["has_level3"])
        self.assertTrue(flags["has_due_to_affiliates"])
        self.assertFalse(flags["has_derivatives"])
        self.assertTrue(flags["scf_presented"])


class Regulatory(unittest.TestCase):
    def test_cayman_metadata_yields_cima_item(self):
        items = build_regulatory_checklist(make_metadata("ASC946", domicile="Cayman Islands"))
        self.assertIn("REG_CIMA_PFA", [i["check_id"] for i in items])

    def test_lux_metadata_yields_cssf_item(self):
        items = build_regulatory_checklist(make_metadata("IFRS", domicile="Luxembourg"))
        self.assertIn("REG_LUX_CSSF", [i["check_id"] for i in items])

    def test_delaware_yields_no_cima_or_cssf(self):
        items = build_regulatory_checklist(make_metadata("USGAAP", domicile="Delaware"))
        ids = [i["check_id"] for i in items]
        self.assertNotIn("REG_CIMA_PFA", ids)
        self.assertNotIn("REG_LUX_CSSF", ids)


if __name__ == "__main__":
    unittest.main()
