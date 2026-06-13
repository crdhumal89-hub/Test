"""Phase 6 suite: the adversarial pass measurably reduces false positives."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from judges.adapter import RuleBasedAdapter                   # noqa: E402
from judges.dispatch import run_judges                        # noqa: E402
from skeptic.skeptic import run_skeptic                       # noqa: E402
from frameworks.registry import select_framework               # noqa: E402
from harness.fixture_factory import make_clean_review          # noqa: E402

VERSIONS = {"engine": "9.0.0", "schema": "9.0", "adapter": "rule_based",
            "model_pin": "claude-fable-5", "prompt_versions": {}, "corpus_versions": {}}
CONFIG = {
    "tolerances": {"line_abs": 1.0, "total_abs": 0.01, "ratio_bps": 5.0,
                   "per_unit_abs": 0.01, "inter_entity_abs": 1.0},
    "materiality": {"default_planning_pct_of_nav": 0.0075,
                    "clearly_trivial_pct_of_materiality": 0.05},
    "skeptic": {"enabled": True, "challenge_severities": ["CRITICAL", "HIGH"]},
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


def synonym_trap_bundle():
    """The hierarchy disclosure exists, but under a title the judges' title
    patterns miss: a 'Valuation' note. A naive reviewer flags it missing."""
    bundle = make_clean_review("ASC946")
    for note in bundle["notes"]["notes"]:
        if "Fair value" in note["title"]:
            note["title"] = "Valuation"
    return bundle


class FalsePositiveReduction(unittest.TestCase):
    def test_synonym_trap_produces_fp_without_skeptic(self):
        bundle = synonym_trap_bundle()
        findings, _ = run_judges(build_ctx(bundle), RuleBasedAdapter())
        fp = [x for x in findings if x["source"] == "standards"]
        self.assertGreaterEqual(len(fp), 2, "trap must produce baseline false positives")

    def test_skeptic_drops_the_false_positives_with_logged_rationale(self):
        bundle = synonym_trap_bundle()
        ctx = build_ctx(bundle)
        findings, _ = run_judges(ctx, RuleBasedAdapter())
        baseline_fp = len([x for x in findings if x["source"] == "standards"])
        surviving, log = run_skeptic(findings, ctx, CONFIG)
        after_fp = len([x for x in surviving if x["source"] == "standards"])
        self.assertGreater(baseline_fp, after_fp, "skeptic must measurably reduce false positives")
        self.assertEqual(0, after_fp, "all synonym-trap FPs should drop")
        dropped = [e for e in log if e["outcome"] == "dropped"]
        self.assertEqual(baseline_fp, len(dropped))
        for e in dropped:
            self.assertIn("alternative phrasing", e["rationale"])

    def test_true_positive_is_upheld_with_confidence_bump(self):
        bundle = make_clean_review("ASC946")
        # Genuinely remove the fair value note: a true gap.
        bundle["notes"]["notes"] = [n for n in bundle["notes"]["notes"]
                                    if "Fair value" not in n["title"]]
        ctx = build_ctx(bundle)
        findings, _ = run_judges(ctx, RuleBasedAdapter())
        surviving, log = run_skeptic(findings, ctx, CONFIG)
        std = [x for x in surviving if x["source"] == "standards"]
        self.assertGreaterEqual(len(std), 2, "true gaps must survive the challenge")
        for x in std:
            self.assertEqual("upheld", x["skeptic"]["outcome"])
            self.assertGreaterEqual(x["confidence_calibrated"], 0.9)

    def test_core_findings_never_challenged(self):
        core_finding = {"source": "core", "severity": "CRITICAL", "message": "x",
                        "confidence_calibrated": 0.99}
        surviving, _ = run_skeptic([core_finding], build_ctx(make_clean_review()), CONFIG)
        self.assertEqual(1, len(surviving))
        self.assertIsNone(surviving[0].get("skeptic"))

    def test_deficient_note_demotes_rather_than_drops(self):
        bundle = make_clean_review("ASC946")
        for note in bundle["notes"]["notes"]:
            if "Fair value" in note["title"]:
                # Keep the note but gut the Level 3 reconciliation language and
                # any synonym the re-scan would accept.
                note["text"] = ("The Fund categorizes fair value measurements into "
                                "Level 1, Level 2 and Level 3 inputs.")
        ctx = build_ctx(bundle)
        findings, _ = run_judges(ctx, RuleBasedAdapter())
        surviving, log = run_skeptic(findings, ctx, CONFIG)
        rollforward = [x for x in surviving if x.get("check_id") == "ASC946_LEVEL3_ROLLFORWARD"]
        self.assertEqual(1, len(rollforward))
        self.assertEqual("HIGH", rollforward[0]["severity"])   # demoted from CRITICAL
        self.assertEqual("demoted", rollforward[0]["skeptic"]["outcome"])

    def test_skeptic_disabled_by_config_is_recorded(self):
        cfg = {**CONFIG, "skeptic": {"enabled": False}}
        surviving, log = run_skeptic([], build_ctx(make_clean_review()), cfg)
        self.assertIn("disabled", log[0]["decision"])


if __name__ == "__main__":
    unittest.main()
