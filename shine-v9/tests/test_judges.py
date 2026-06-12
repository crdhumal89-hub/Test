"""Phase 5 suite: the five reviewers on clean and defective drafts."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from judges.adapter import RuleBasedAdapter, ClaudeAdapter, AdapterNotConfigured  # noqa: E402
from judges.dispatch import run_judges                       # noqa: E402
from frameworks.registry import select_framework              # noqa: E402
from schema.validator import validate_finding                 # noqa: E402
from harness.fixture_factory import make_clean_review         # noqa: E402

VERSIONS = {"engine": "9.0.0", "schema": "9.0", "adapter": "rule_based",
            "model_pin": "claude-fable-5", "prompt_versions": {"judges": "rb-9.0.0"},
            "corpus_versions": {}}
CONFIG = {
    "tolerances": {"line_abs": 1.0, "total_abs": 0.01, "ratio_bps": 5.0,
                   "per_unit_abs": 0.01, "inter_entity_abs": 1.0},
    "materiality": {"default_planning_pct_of_nav": 0.0075,
                    "clearly_trivial_pct_of_materiality": 0.05},
}


def build_ctx(bundle):
    return {
        "figures": bundle["figures"], "notes": bundle["notes"],
        "metadata": bundle["metadata"], "manifest": bundle["manifest"],
        "prior_figures": bundle.get("prior_figures"),
        "sibling_figures": bundle.get("sibling_figures"),
        "framework": select_framework(bundle["metadata"]),
        "config": CONFIG, "versions": VERSIONS,
    }


def run_clean(framework):
    return run_judges(build_ctx(make_clean_review(framework)), RuleBasedAdapter())


class CleanDrafts(unittest.TestCase):
    def test_clean_asc946_emits_zero_judgment_findings(self):
        findings, _ = run_clean("ASC946")
        self.assertEqual([], [(f["source"], f["message"]) for f in findings])

    def test_clean_ifrs_emits_zero_judgment_findings(self):
        findings, _ = run_clean("IFRS")
        self.assertEqual([], [(f["source"], f["message"]) for f in findings])

    def test_clean_usgaap_emits_zero_judgment_findings(self):
        findings, _ = run_clean("USGAAP")
        self.assertEqual([], [(f["source"], f["message"]) for f in findings])

    def test_coverage_accounts_for_every_reviewer(self):
        _, coverage = run_clean("ASC946")
        self.assertEqual({"presentation", "disclosure", "standards", "comparative", "regulatory"},
                         set(coverage.keys()))
        for name, cov in coverage.items():
            for skip in cov["skipped"]:
                self.assertIn("reason_code", skip, f"{name} skip lacks reason code")


class DefectiveDrafts(unittest.TestCase):
    def test_wrong_entity_name_is_critical_certain(self):
        bundle = make_clean_review()
        bundle["figures"]["entity"]["legal_name"] = "Golden Fund III LP"
        findings, _ = run_judges(build_ctx(bundle), RuleBasedAdapter())
        hits = [x for x in findings if x["category"] == "entity_mismatch"]
        self.assertEqual(1, len(hits))
        self.assertEqual(("CRITICAL", "CERTAIN"), (hits[0]["severity"], hits[0]["confidence_label"]))

    def test_missing_highlights_under_asc946_is_presentation_gap(self):
        bundle = make_clean_review("ASC946")
        del bundle["figures"]["financial_highlights"]
        findings, _ = run_judges(build_ctx(bundle), RuleBasedAdapter())
        hits = [x for x in findings if x["category"] == "presentation_gap"]
        self.assertEqual(1, len(hits))
        self.assertIn("Financial Highlights", hits[0]["statement"])

    def test_missing_scf_breaks_ifrs_but_not_asc946(self):
        for framework, expected in (("IFRS", 1), ("ASC946", 0)):
            bundle = make_clean_review(framework)
            bundle["figures"]["cash_flows"] = {"present": False}
            findings, _ = run_judges(build_ctx(bundle), RuleBasedAdapter())
            hits = [x for x in findings if x["category"] == "presentation_gap"
                    and "Cash Flows" in x["statement"]]
            self.assertEqual(expected, len(hits), framework)

    def test_missing_level3_note_yields_cited_standards_findings(self):
        bundle = make_clean_review("ASC946")
        bundle["notes"]["notes"] = [n for n in bundle["notes"]["notes"]
                                    if "Fair value" not in n["title"]]
        findings, _ = run_judges(build_ctx(bundle), RuleBasedAdapter())
        std = [x for x in findings if x["source"] == "standards"]
        self.assertGreaterEqual(len(std), 2)  # hierarchy, rollforward, inputs
        for x in std:
            self.assertTrue(x["evidence"]["citation_key"], x["message"])

    def test_placeholder_text_is_critical(self):
        bundle = make_clean_review()
        bundle["notes"]["notes"][1]["text"] += " Fair value of [TBD] remains under discussion."
        findings, _ = run_judges(build_ctx(bundle), RuleBasedAdapter())
        hits = [x for x in findings if x["category"] == "placeholder_text"]
        self.assertEqual(1, len(hits))
        self.assertEqual("CRITICAL", hits[0]["severity"])

    def test_cayman_missing_pfa_reference_is_regulatory_gap(self):
        bundle = make_clean_review("ASC946")
        # Strip the PFA registration sentence but keep the audit reference so
        # the defect isolates the PFA gap.
        bundle["notes"]["notes"][0]["text"] = (
            "Golden Fund A LP (the Fund) is a closed-end investment vehicle. "
            "The Fund distributes annual audited financial statements to all investors.")
        findings, _ = run_judges(build_ctx(bundle), RuleBasedAdapter())
        hits = [x for x in findings if x["category"] == "regulatory_gap"]
        self.assertEqual(1, len(hits))
        self.assertEqual("CIMA:PFA", hits[0]["evidence"]["citation_key"])

    def test_unexplained_material_movement_flagged(self):
        bundle = make_clean_review()
        prior = make_clean_review()["figures"]
        prior["balance_sheet"]["assets"]["investments_at_fair_value"] = 60000000.0
        bundle["prior_figures"] = prior
        findings, _ = run_judges(build_ctx(bundle), RuleBasedAdapter())
        hits = [x for x in findings if x["category"] == "comparative_movement"]
        self.assertEqual(1, len(hits))
        self.assertEqual(40000000.0, hits[0]["evidence"]["delta"])

    def test_feeder_master_break_caught(self):
        bundle = make_clean_review()
        bundle["metadata"]["linked_entities"] = [
            {"code": "FEEDER-A", "relationship": "feeder", "ownership_pct": 1.0}]
        bundle["sibling_figures"] = {
            "entity": {"fund_code": "FEEDER-A"},
            "balance_sheet": {"assets": {"investment_in_master": 101000000.0}}}
        findings, _ = run_judges(build_ctx(bundle), RuleBasedAdapter())
        hits = [x for x in findings if x["category"] == "inter_entity_break"]
        self.assertEqual(1, len(hits))
        self.assertEqual(-2000000.0, hits[0]["evidence"]["delta"])

    def test_all_emitted_findings_validate_after_citation_stamp(self):
        bundle = make_clean_review("ASC946")
        bundle["notes"]["notes"] = bundle["notes"]["notes"][3:]  # drop several notes
        findings, _ = run_judges(build_ctx(bundle), RuleBasedAdapter())
        self.assertGreater(len(findings), 0)
        for x in findings:
            # Stand in for the orchestrator's citation stamp before validation.
            if x["source"] in ("standards", "regulatory"):
                x["evidence"]["citation_verified"] = True
            errs = [e for e in validate_finding(x) if "F-NNN" not in e]
            self.assertEqual([], errs, f"{x['message']}: {errs}")


class AdapterBoundary(unittest.TestCase):
    def test_claude_adapter_without_credentials_halts(self):
        import os
        self.assertNotIn("ANTHROPIC_API_KEY", os.environ)
        with self.assertRaises(AdapterNotConfigured):
            ClaudeAdapter("claude-fable-5")


if __name__ == "__main__":
    unittest.main()
