"""Batch runner suite: discovery, independence, summary, exit codes."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from run_batch import discover_review_folders, main as batch_main   # noqa: E402
from harness.fixture_factory import make_clean_review, mutate, write_review_folder  # noqa: E402


class Batch(unittest.TestCase):
    def _root(self, tmp):
        root = Path(tmp)
        write_review_folder(root / "AAA" / "FUND-A" / "Draft-1", make_clean_review("ASC946"))
        broken = make_clean_review("ASC946")
        broken["figures"] = mutate(broken["figures"], "balance_sheet.partners_capital", 104000000.0)
        write_review_folder(root / "AAA" / "FUND-B" / "Draft-1", broken)
        return root

    def test_discovery_finds_both_reviews(self):
        with tempfile.TemporaryDirectory() as tmp:
            folders = discover_review_folders(self._root(tmp))
            self.assertEqual(2, len(folders))

    def test_batch_runs_both_writes_summary_exit_1_on_not_ready(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self._root(tmp)
            code = batch_main(["run_batch.py", str(root)])
            self.assertEqual(1, code)   # FUND-B is NOT_READY
            summary = json.loads((root / "_outputs_batch_summary.json").read_text())
            self.assertEqual(2, summary["total"])
            self.assertEqual(1, summary["ready"])
            self.assertEqual([], summary["failures"])
            verdicts = {r["review"]: r["verdict"] for r in summary["results"]}
            self.assertEqual("READY", verdicts["AAA/FUND-A/Draft-1"])
            self.assertEqual("NOT_READY", verdicts["AAA/FUND-B/Draft-1"])

    def test_one_failure_never_blocks_the_rest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self._root(tmp)
            # Corrupt FUND-B's figures so its run raises.
            (root / "AAA" / "FUND-B" / "Draft-1" / "inputs" / "figures.json").write_text("{broken")
            code = batch_main(["run_batch.py", str(root)])
            self.assertEqual(2, code)
            summary = json.loads((root / "_outputs_batch_summary.json").read_text())
            self.assertEqual(1, len(summary["failures"]))
            self.assertEqual(1, len(summary["results"]))   # FUND-A still ran


if __name__ == "__main__":
    unittest.main()
