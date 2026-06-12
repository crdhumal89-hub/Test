"""Phase 7 suite: reconciler, suppression, dashboard, exports, full pipeline."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from run_review import run, load_config                       # noqa: E402
from harness.fixture_factory import (make_clean_review, mutate,
                                     write_review_folder)      # noqa: E402


def run_bundle(bundle):
    with tempfile.TemporaryDirectory() as tmp:
        write_review_folder(tmp, bundle)
        return run(tmp, load_config()), Path(tmp)


class FullPipelineClean(unittest.TestCase):
    def test_clean_review_zero_findings_and_ready(self):
        result, _ = run_bundle(make_clean_review("ASC946"))
        self.assertEqual([], [(f["source"], f["message"]) for f in result["findings"]])
        self.assertEqual("READY", result["verdict"]["state"])
        self.assertEqual(0, result["coverage"]["skips_without_reason"])
        self.assertEqual(1.0, result["coverage"]["completeness_pct"])

    def test_outputs_written(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, make_clean_review())
            run(tmp, load_config())
            out = Path(tmp) / "_outputs"
            for name in ("findings.json", "findings_app.json", "coverage_manifest.json",
                         "ledger.json", "telemetry.json", "skeptic_decisions.json",
                         "reconciler_decisions.json", "rejected_findings.json",
                         "dashboard.html", "preparer_export.pdf", "audit_file_export.pdf"):
                self.assertTrue((out / name).is_file(), f"missing output: {name}")

    def test_two_runs_identical_findings_and_ledger(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, make_clean_review())
            r1 = run(tmp, load_config())
            ledger1 = (Path(tmp) / "_outputs" / "ledger.json").read_text()
            r2 = run(tmp, load_config())
            ledger2 = (Path(tmp) / "_outputs" / "ledger.json").read_text()
            self.assertEqual(ledger1, ledger2)
            self.assertEqual(r1["findings"], r2["findings"])


class Reconciler(unittest.TestCase):
    def _cluster_bundle(self):
        bundle = make_clean_review("ASC946")
        # Break the level totals (core finding) AND gut the Level 3 note
        # language including every synonym so the skeptic upholds the gap.
        bundle["figures"]["schedule_of_investments"]["level_totals"]["3"] = 55000000.0
        for note in bundle["notes"]["notes"]:
            if "Fair value" in note["title"]:
                note["text"] = ("The Fund categorizes fair value measurements into "
                                "Level 1, Level 2 and Level 3 inputs. Significant "
                                "unobservable inputs include market multiples and "
                                "discount rates, with ranges and weighted averages disclosed.")
        return bundle

    def test_level3_cluster_collapses_with_constituents_preserved(self):
        result, _ = run_bundle(self._cluster_bundle())
        roots = [f for f in result["findings"] if f.get("reconciler")]
        self.assertEqual(1, len(roots))
        root = roots[0]
        self.assertEqual("P01 Level 3 infrastructure cluster", root["reconciler"]["pattern"])
        self.assertEqual(2, len(root["reconciler"]["constituents"]))
        sources = {c["source"] for c in root["reconciler"]["constituents"]}
        self.assertEqual({"core", "standards"}, sources)
        # Constituents are no longer standalone findings.
        standalone = [f for f in result["findings"] if not f.get("reconciler")
                      and f["evidence"].get("relationship") == "SOI_LEVELS_FOOT"]
        self.assertEqual([], standalone)
        # The decision log records candidates and the collapse.
        outcomes = [e.get("outcome") for e in result["reconciler_log"] if "outcome" in e]
        self.assertIn("collapsed", outcomes)


class Suppression(unittest.TestCase):
    def test_trivial_break_suppressed_but_retained(self):
        bundle = make_clean_review("ASC946")
        bundle["figures"] = mutate(bundle["figures"], "balance_sheet.assets.total_assets", 108000500.0)
        # Keep the tie-out aligned with the (broken) statement so only the
        # footing break and balance break fire; the 500 break is below trivial.
        bundle["figures"]["tie_out"]["balance_sheet.assets.total_assets"] = 108000500.0
        result, _ = run_bundle(bundle)
        trivial = [f for f in result["findings"]
                   if f["evidence"].get("relationship") == "BS_ASSETS_FOOT"]
        self.assertEqual(1, len(trivial))
        self.assertTrue(trivial[0]["suppressed"], "trivial LOW finding should be suppressed")
        self.assertTrue(trivial[0]["materiality"]["clearly_trivial"])


class Dashboard(unittest.TestCase):
    def test_dashboard_renders_with_required_surfaces_and_no_em_dash(self):
        bundle = make_clean_review("ASC946")
        bundle["figures"] = mutate(bundle["figures"], "balance_sheet.partners_capital", 104000000.0)
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, bundle)
            run(tmp, load_config())
            html = (Path(tmp) / "_outputs" / "dashboard.html").read_text(encoding="utf-8")
        self.assertIn("NOT READY", html)
        self.assertIn("cfo-row", html)
        self.assertIn("Statement of Assets and Liabilities", html)
        self.assertIn("Architecture: Ashitosh Shinde", html)
        self.assertNotIn("—", html, "em dash leaked into the dashboard")

    def test_dashboard_javascript_passes_node_syntax_check(self):
        bundle = make_clean_review("ASC946")
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, bundle)
            run(tmp, load_config())
            html = (Path(tmp) / "_outputs" / "dashboard.html").read_text(encoding="utf-8")
            script = html.split("<script>")[1].split("</script>")[0]
            js_path = Path(tmp) / "dash.js"
            js_path.write_text(script, encoding="utf-8")
            proc = subprocess.run(["node", "--check", str(js_path)],
                                  capture_output=True, text=True)
            self.assertEqual(0, proc.returncode, proc.stderr)


class Exports(unittest.TestCase):
    def _run_with_breaks(self):
        bundle = make_clean_review("ASC946")
        bundle["figures"] = mutate(bundle["figures"], "balance_sheet.partners_capital", 104000000.0)
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, bundle)
            result = run(tmp, load_config())
            prep = (Path(tmp) / "_outputs" / "preparer_export.pdf").read_bytes()
            audit = (Path(tmp) / "_outputs" / "audit_file_export.pdf").read_bytes()
        return result, prep, audit

    def test_exports_are_valid_pdfs_with_footer(self):
        _, prep, audit = self._run_with_breaks()
        for pdf in (prep, audit):
            self.assertTrue(pdf.startswith(b"%PDF-1.4"))
            self.assertIn(b"%%EOF", pdf)
            self.assertIn(b"/Type /Page", pdf)
            self.assertIn(b"Ashitosh Shinde", pdf)

    def test_discarded_findings_excluded_from_both_exports(self):
        from render.exports import render_export
        from frameworks.registry import select_framework
        from harness.fixture_factory import make_metadata
        framework = select_framework(make_metadata("ASC946"))
        config = load_config()
        findings = [{
            "id": "F-001", "source": "core", "severity": "HIGH", "confidence_label": "CERTAIN",
            "statement": "Statement of Operations", "section": "Expenses", "sort_order": 1,
            "location": {"statement": "Statement of Operations", "line_id": "Total expenses",
                         "note_id": None}, "message": "DISCARDED-MARKER-TEXT should not appear",
            "fix": "n/a", "evidence": {}, "materiality": {"clearly_trivial": False},
            "suppressed": False, "state": "DISCARDED",
        }]
        meta = {"legal_name": "X", "period": "FY2025"}
        verdict = {"state": "READY", "driver": "test"}
        for mode in ("preparer", "audit"):
            pdf = render_export(findings, meta, verdict, framework, config, mode)
            self.assertNotIn(b"DISCARDED-MARKER-TEXT", pdf, mode)

    def test_suppressed_excluded_from_preparer_included_in_audit(self):
        from render.exports import render_export
        from frameworks.registry import select_framework
        from harness.fixture_factory import make_metadata
        framework = select_framework(make_metadata("ASC946"))
        config = load_config()
        findings = [{
            "id": "F-001", "source": "core", "severity": "LOW", "confidence_label": "CERTAIN",
            "statement": "Statement of Operations", "section": "Expenses", "sort_order": 1,
            "location": {"statement": "Statement of Operations", "line_id": "x", "note_id": None},
            "message": "SUPPRESSED-MARKER-TEXT trivial break", "fix": "n/a", "evidence": {},
            "materiality": {"clearly_trivial": True}, "suppressed": True, "state": "OPEN",
        }]
        meta = {"legal_name": "X", "period": "FY2025"}
        verdict = {"state": "READY", "driver": "test"}
        prep = render_export(findings, meta, verdict, framework, config, "preparer")
        audit = render_export(findings, meta, verdict, framework, config, "audit")
        self.assertNotIn(b"SUPPRESSED-MARKER-TEXT", prep)
        self.assertIn(b"SUPPRESSED-MARKER-TEXT", audit)


class ReadinessGate(unittest.TestCase):
    def test_critical_break_blocks_readiness(self):
        bundle = make_clean_review("ASC946")
        bundle["figures"] = mutate(bundle["figures"], "balance_sheet.partners_capital", 104000000.0)
        result, _ = run_bundle(bundle)
        self.assertEqual("NOT_READY", result["verdict"]["state"])
        self.assertIn("critical", result["verdict"]["driver"])


if __name__ == "__main__":
    unittest.main()
