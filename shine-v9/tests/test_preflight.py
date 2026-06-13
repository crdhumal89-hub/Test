"""Pre-flight validation tests."""
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from harness.preflight import preflight                          # noqa: E402
from harness.fixture_factory import make_clean_review, write_review_folder  # noqa: E402


class Preflight(unittest.TestCase):
    def test_clean_review_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, make_clean_review("ASC946"))
            errors, warnings = preflight(tmp)
            self.assertEqual([], errors)

    def test_missing_framework_is_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            bundle = make_clean_review("ASC946")
            del bundle["metadata"]["presentation"]["framework"]
            write_review_folder(tmp, bundle)
            errors, _ = preflight(tmp)
            self.assertTrue(any("framework" in e for e in errors))

    def test_missing_figures_halts_as_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, make_clean_review("ASC946"))
            (Path(tmp) / "inputs" / "figures.json").unlink()
            errors, _ = preflight(tmp)
            self.assertTrue(any("halt" in e for e in errors))

    def test_tie_out_dangling_path_is_a_warning(self):
        with tempfile.TemporaryDirectory() as tmp:
            bundle = make_clean_review("ASC946")
            bundle["figures"]["tie_out"]["balance_sheet.assets.nonexistent_line"] = 1.0
            write_review_folder(tmp, bundle)
            errors, warnings = preflight(tmp)
            self.assertEqual([], errors)
            self.assertTrue(any("nonexistent_line" in w for w in warnings))

    def test_empty_notes_is_a_warning_not_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            bundle = make_clean_review("ASC946")
            bundle["notes"] = {"notes": []}
            write_review_folder(tmp, bundle)
            errors, warnings = preflight(tmp)
            self.assertEqual([], errors)
            self.assertTrue(any("empty notes" in w for w in warnings))


if __name__ == "__main__":
    unittest.main()
