"""Phase 2 suite: discovery, halt-vs-degrade, and the reproducibility ledger."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ingest.discovery import load_review, HaltError              # noqa: E402
from ingest.outputs import outputs_dir, write_json                # noqa: E402
from ledger.run_ledger import build_ledger, finalize_ledger, serialize_ledger  # noqa: E402
from harness.fixture_factory import make_clean_review, write_review_folder     # noqa: E402

VERSIONS = {"engine": "9.0.0", "schema": "9.0", "adapter": "rule_based", "model_pin": "claude-fable-5",
            "prompt_versions": {}, "corpus_versions": {}}
CONFIG = {"tolerances": {"line_abs": 1.0}, "materiality": {}}


class Discovery(unittest.TestCase):
    def test_loads_complete_review_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, make_clean_review())
            review = load_review(tmp)
            self.assertEqual("GLD-FUND-A", review.metadata["fund_code"])
            self.assertEqual("FY2025", review.figures["entity"]["period"])
            self.assertGreaterEqual(len(review.notes["notes"]), 7)
            self.assertEqual([], review.degradation_chips)
            self.assertIn("figures.json", review.raw_files)

    def test_missing_figures_halts(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, make_clean_review())
            (Path(tmp) / "inputs" / "figures.json").unlink()
            with self.assertRaises(HaltError):
                load_review(tmp)

    def test_missing_notes_degrades_with_chip(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, make_clean_review())
            (Path(tmp) / "inputs" / "notes.json").unlink()
            review = load_review(tmp)
            self.assertEqual(1, len(review.degradation_chips))
            self.assertEqual("notes.json", review.degradation_chips[0]["input"])

    def test_unparseable_figures_halts(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, make_clean_review())
            (Path(tmp) / "inputs" / "figures.json").write_text("{broken", encoding="utf-8")
            with self.assertRaises(HaltError):
                load_review(tmp)


class Ledger(unittest.TestCase):
    def test_identical_inputs_produce_identical_ledgers(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, make_clean_review())
            review1 = load_review(tmp)
            review2 = load_review(tmp)
            findings = [{"id": "F-001", "severity": "LOW"}]
            coverage = {"checked": ["BS_BALANCE"], "skipped": []}
            ledger1 = serialize_ledger(finalize_ledger(
                build_ledger(review1.raw_files, CONFIG, VERSIONS), findings, coverage))
            ledger2 = serialize_ledger(finalize_ledger(
                build_ledger(review2.raw_files, CONFIG, VERSIONS), findings, coverage))
            self.assertEqual(ledger1, ledger2)
            self.assertNotIn("timestamp", ledger1)

    def test_changed_input_changes_run_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, make_clean_review())
            review1 = load_review(tmp)
            figures_path = Path(tmp) / "inputs" / "figures.json"
            figures = json.loads(figures_path.read_text())
            figures["balance_sheet"]["partners_capital"] = 104000000.0
            figures_path.write_text(json.dumps(figures, sort_keys=True, indent=1))
            review2 = load_review(tmp)
            l1 = build_ledger(review1.raw_files, CONFIG, VERSIONS)
            l2 = build_ledger(review2.raw_files, CONFIG, VERSIONS)
            self.assertNotEqual(l1["run_id"], l2["run_id"])
            self.assertNotEqual(l1["input_hashes"]["figures.json"], l2["input_hashes"]["figures.json"])

    def test_changed_config_changes_run_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, make_clean_review())
            review = load_review(tmp)
            l1 = build_ledger(review.raw_files, CONFIG, VERSIONS)
            l2 = build_ledger(review.raw_files, {**CONFIG, "materiality": {"x": 1}}, VERSIONS)
            self.assertNotEqual(l1["run_id"], l2["run_id"])

    def test_outputs_writer_creates_parallel_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, make_clean_review())
            out = outputs_dir(tmp)
            write_json(out, "probe.json", {"ok": True})
            self.assertTrue((Path(tmp) / "_outputs" / "probe.json").is_file())


if __name__ == "__main__":
    unittest.main()
