"""Regression tests for the pre-ship audit fixes.

One test per real bug the expert audit surfaced, so none can silently return.
"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from run_review import run, load_config                          # noqa: E402
from render.pdf_writer import PdfBuilder, latinize                # noqa: E402
from render.exports import render_export                          # noqa: E402
from reconcile.reconciler import run_reconciler, _strongest_recurrence  # noqa: E402
from reconcile.escalation import apply_escalation                  # noqa: E402
from evidence.corpus import load_corpus                            # noqa: E402
from frameworks.registry import select_framework                   # noqa: E402
from schema.validator import validate_finding                      # noqa: E402
from harness.fixture_factory import (make_clean_review, make_metadata,
                                     mutate, write_review_folder)   # noqa: E402

CORPUS_PATHS = ["../shine-fs-review-v8/reference", "evidence/corpus_data"]


class PdfEncoding(unittest.TestCase):
    def test_curly_quotes_and_dashes_transliterated_not_mangled(self):
        self.assertEqual('"q" and -- and ...', latinize("“q” and -- and …"))
        b = PdfBuilder(footer_left="F")
        b.add("Entity “Fund” value and en–dash and ellipsis…", size=9)
        pdf = b.build()
        self.assertNotIn(b"?quote?", pdf)
        self.assertIn(b'"Fund"', pdf)   # curly quotes became straight, not "?"

    def test_pdf_remains_valid_multipage(self):
        b = PdfBuilder(footer_left="F")
        for i in range(120):
            b.add(f"line {i} with content", size=9)
        pdf = b.build()
        self.assertTrue(pdf.startswith(b"%PDF-1.4"))
        self.assertTrue(pdf.rstrip().endswith(b"%%EOF"))
        self.assertEqual(3, pdf.count(b"/Type /Page "))
        self.assertEqual(1, pdf.count(b"/Type /Pages "))


class CliErrorSurface(unittest.TestCase):
    def test_missing_framework_returns_clean_error_no_traceback(self):
        with tempfile.TemporaryDirectory() as tmp:
            bundle = make_clean_review("ASC946")
            del bundle["metadata"]["presentation"]["framework"]
            write_review_folder(tmp, bundle)
            proc = subprocess.run(
                [sys.executable, "run_review.py", tmp],
                cwd=str(ROOT), capture_output=True, text=True)
            self.assertEqual(2, proc.returncode)
            self.assertIn("error:", proc.stderr)
            self.assertNotIn("Traceback", proc.stderr)

    def test_config_flag_without_path_returns_2(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, make_clean_review("ASC946"))
            proc = subprocess.run(
                [sys.executable, "run_review.py", tmp, "--config"],
                cwd=str(ROOT), capture_output=True, text=True)
            self.assertEqual(2, proc.returncode)
            self.assertNotIn("Traceback", proc.stderr)


class FinalValidation(unittest.TestCase):
    def test_every_emitted_finding_is_schema_valid(self):
        bundle = make_clean_review("ASC946")
        bundle["figures"] = mutate(bundle["figures"], "balance_sheet.partners_capital", 104000000.0)
        bundle["notes"]["notes"] = [n for n in bundle["notes"]["notes"] if "Fair value" not in n["title"]]
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, bundle)
            run(tmp, load_config())
            findings = json.loads((Path(tmp) / "_outputs" / "findings.json").read_text())
        self.assertGreater(len(findings), 0)
        for f in findings:
            self.assertEqual([], validate_finding(f), f.get("message", "")[:80])

    def test_x_note_found_scaffolding_stripped_from_output(self):
        bundle = make_clean_review("ASC946")
        bundle["notes"]["notes"] = [n for n in bundle["notes"]["notes"] if "Fair value" not in n["title"]]
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, bundle)
            run(tmp, load_config())
            raw = (Path(tmp) / "_outputs" / "findings.json").read_text()
        self.assertNotIn("x_note_found", raw)


class CitationRegex(unittest.TestCase):
    def test_multi_letter_paren_suffix_indexed(self):
        idx = load_corpus(ROOT, CORPUS_PATHS)
        # asc-matrices.md carries 820-10-50-2(bbb) for significant transfers.
        self.assertIsNotNone(idx.lookup("ASC 820-10-50-2(bbb)"))
        # and it does not collide with the single-letter (b).
        self.assertIsNotNone(idx.lookup("ASC 820-10-50-2(b)"))


class SyntheticResolvedLayer(unittest.TestCase):
    def test_preserves_prior_layer(self):
        fw = select_framework(make_metadata("ASC946"))
        prior = [{"merge_key": "k-core", "state": "OPEN", "layer": "L2",
                  "statement": "Statement of Operations", "section": "Expenses"}]
        findings, _ = apply_escalation([], prior, fw)
        synthetic = [f for f in findings if f.get("synthetic_resolved")]
        self.assertEqual(1, len(synthetic))
        self.assertEqual("L2", synthetic[0]["legacy_layer"])   # not hardcoded L10
        self.assertEqual("comparative", synthetic[0]["source"])   # valid v9 enum


class ClusterRecurrence(unittest.TestCase):
    def test_clustered_recurring_constituents_propagate_to_root(self):
        fw = select_framework(make_metadata("ASC946"))
        self.assertEqual("RECURRING", _strongest_recurrence(
            [{"prior_review_recurrence": "RECURRING"}, {"prior_review_recurrence": "NEW"}]))
        self.assertEqual("REGRESSED", _strongest_recurrence(
            [{"prior_review_recurrence": "RECURRING"}, {"prior_review_recurrence": "REGRESSED"}]))
        self.assertEqual("EVERGREEN_ACCEPTED", _strongest_recurrence(
            [{"prior_review_recurrence": "EVERGREEN_ACCEPTED"}, {"prior_review_recurrence": "EVERGREEN_ACCEPTED"}]))
        # mixed evergreen + recurring -> recurring dominates (readiness-affecting)
        self.assertEqual("RECURRING", _strongest_recurrence(
            [{"prior_review_recurrence": "EVERGREEN_ACCEPTED"}, {"prior_review_recurrence": "RECURRING"}]))

    def test_end_to_end_cluster_root_carries_recurrence(self):
        # A Level-3 cluster (core levels break + standards rollforward gap)
        # whose constituents both recurred should surface RECURRING at the root.
        bundle = make_clean_review("ASC946")
        bundle["figures"]["schedule_of_investments"]["level_totals"]["3"] = 55000000.0
        for note in bundle["notes"]["notes"]:
            if "Fair value" in note["title"]:
                note["text"] = ("The Fund categorizes fair value measurements into Level 1, "
                                "Level 2 and Level 3 inputs. Significant unobservable inputs "
                                "include market multiples and discount rates, with ranges and "
                                "weighted averages disclosed.")
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, bundle)
            first = run(tmp, load_config())
            root = next(f for f in first["findings"] if f.get("reconciler"))
            # Feed the constituents back as prior findings, OPEN.
            prior = [dict(c, state="OPEN") for c in root["reconciler"]["constituents"]]
            (Path(tmp) / "inputs" / "prior_findings.json").write_text(json.dumps(prior))
            second = run(tmp, load_config())
            root2 = next(f for f in second["findings"] if f.get("reconciler"))
            self.assertEqual("RECURRING", root2["prior_review_recurrence"])


class MergeKeyUniqueness(unittest.TestCase):
    def test_checklist_findings_have_distinct_merge_keys(self):
        # Drop the fair value note: hierarchy, rollforward, and inputs items
        # all fire in the same statement/section/category. They must not collide.
        bundle = make_clean_review("ASC946")
        bundle["notes"]["notes"] = [n for n in bundle["notes"]["notes"] if "Fair value" not in n["title"]]
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, bundle)
            result = run(tmp, load_config())
        std = [f for f in result["findings"] if f["source"] == "standards"]
        keys = [f["merge_key"] for f in std]
        self.assertEqual(len(keys), len(set(keys)), "standards findings collided on merge_key")


class AuditTreePathGuard(unittest.TestCase):
    def test_reviewer_with_separator_rejected(self):
        from ingest.outputs import outputs_dir
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                outputs_dir(tmp, {"output": {"mode": "audit_tree"}},
                            reviewer="../escape", stamp="20260613-0000")


if __name__ == "__main__":
    unittest.main()
