"""Phase 9 suite: the harness itself must be falsifiable, not vacuously green."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from harness.runner import _matches, score_fixture     # noqa: E402


FINDING = {
    "id": "F-001", "source": "core", "category": "footing_break",
    "evidence": {"relationship": "BS_ASSETS_FOOT"}, "suppressed": False,
    "reconciler": None,
}
ROOT_CAUSE = {
    "id": "F-002", "source": "standards", "category": "standards_gap",
    "check_id": "ASC946_LEVEL3_ROLLFORWARD", "evidence": {}, "suppressed": False,
    "reconciler": {"pattern": "P01", "score": 8, "constituents": [
        {"category": "footing_break", "evidence": {"relationship": "SOI_LEVELS_FOOT"},
         "source": "core"}]},
}


class Matcher(unittest.TestCase):
    def test_relationship_match(self):
        self.assertTrue(_matches(
            {"category": "footing_break", "relationship": "BS_ASSETS_FOOT", "check_id": None},
            FINDING))

    def test_wrong_relationship_does_not_match(self):
        self.assertFalse(_matches(
            {"category": "footing_break", "relationship": "NONEXISTENT_REL", "check_id": None},
            FINDING))

    def test_constituents_inside_root_cause_match(self):
        self.assertTrue(_matches(
            {"category": "footing_break", "relationship": "SOI_LEVELS_FOOT", "check_id": None},
            ROOT_CAUSE))


class Falsifiability(unittest.TestCase):
    def test_planted_impossible_expectation_fails_must_catch(self):
        result = {"findings": [dict(FINDING)], "verdict": {"state": "NOT_READY"}}
        expected = [{"category": "balance_break", "relationship": "IMPOSSIBLE",
                     "check_id": None, "must_catch": True, "note": "planted miss"}]
        row = score_fixture("probe", result, expected)
        self.assertEqual(0, row["matched"])
        self.assertEqual(["planted miss"], row["missed_must_catch"])
        self.assertEqual(1, len(row["false_positives"]))

    def test_unexpected_emission_counts_as_false_positive(self):
        result = {"findings": [dict(FINDING)], "verdict": {"state": "NOT_READY"}}
        row = score_fixture("probe", result, [])
        self.assertEqual(1, len(row["false_positives"]))


if __name__ == "__main__":
    unittest.main()
