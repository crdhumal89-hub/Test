"""Phase 8 suite: telemetry written per run; dispositions update the feedback record."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from run_review import run, load_config                        # noqa: E402
from ledger.dispositions import load_feedback, record_dispositions  # noqa: E402
from harness.fixture_factory import make_clean_review, write_review_folder  # noqa: E402


class Telemetry(unittest.TestCase):
    def test_run_writes_per_layer_timings(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, make_clean_review())
            run(tmp, load_config())
            telemetry = json.loads((Path(tmp) / "_outputs" / "telemetry.json").read_text())
        for layer in ("ingest", "core", "judges", "skeptic", "total"):
            self.assertIn(layer, telemetry["timings_seconds"])
        self.assertIn("finding_count", telemetry)

    def test_ledger_contains_no_timing_telemetry(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, make_clean_review())
            run(tmp, load_config())
            ledger_text = (Path(tmp) / "_outputs" / "ledger.json").read_text()
        self.assertNotIn("timings", ledger_text)
        self.assertNotIn("timestamp", ledger_text)


class DispositionLoop(unittest.TestCase):
    def test_simulated_disposition_updates_feedback_record(self):
        feedback = {"feedback_version": "9.0", "by_category": {}, "golden_candidates": []}
        findings = [
            {"category": "standards_gap", "state": "DISCARDED", "severity": "HIGH",
             "check_id": "ASC946_HIERARCHY_TABLE", "message": "fp", "evidence": {}},
            {"category": "balance_break", "state": "ACCEPTED", "severity": "CRITICAL",
             "message": "real", "evidence": {"relationship": "BS_BALANCE"}},
            {"category": "disclosure_gap", "state": "OPEN", "severity": "MEDIUM",
             "message": "open", "evidence": {}},
        ]
        feedback = record_dispositions(findings, feedback)
        self.assertEqual(1, feedback["by_category"]["standards_gap"]["discarded"])
        self.assertEqual(1, feedback["by_category"]["balance_break"]["accepted"])
        self.assertEqual(1, feedback["by_category"]["disclosure_gap"]["open"])
        kinds = [c["kind"] for c in feedback["golden_candidates"]]
        self.assertIn("false_positive_fixture", kinds)
        self.assertIn("must_catch_fixture", kinds)

    def test_feedback_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "feedback.json"
            feedback = load_feedback(path)
            feedback = record_dispositions(
                [{"category": "ratio_break", "state": "DISCARDED", "severity": "HIGH",
                  "message": "x", "evidence": {}}], feedback)
            from ledger.dispositions import save_feedback
            save_feedback(feedback, path)
            again = load_feedback(path)
            self.assertEqual(1, again["by_category"]["ratio_break"]["discarded"])


if __name__ == "__main__":
    unittest.main()
