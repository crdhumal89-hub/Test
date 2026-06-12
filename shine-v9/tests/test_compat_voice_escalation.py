"""v9.1 suite: BASE-shape projection, voice annotation, prior-review
escalation, Box adapter, audit-tree outputs, coverage split."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from run_review import run, load_config                      # noqa: E402
from schema.compat import to_v8compat, base_check_ref        # noqa: E402
from schema.v8compat_validator import validate_v8compat       # noqa: E402
from reconcile.voice import polish, annotate                  # noqa: E402
from reconcile.escalation import apply_escalation              # noqa: E402
from ingest.box_adapter import load_review_from_box, BoxUnreachable  # noqa: E402
from ingest.outputs import outputs_dir                         # noqa: E402
from frameworks.registry import select_framework               # noqa: E402
from harness.fixture_factory import (make_clean_review, make_metadata,
                                     mutate, write_review_folder)  # noqa: E402


def run_bundle(bundle, config=None):
    with tempfile.TemporaryDirectory() as tmp:
        write_review_folder(tmp, bundle)
        result = run(tmp, config or load_config())
        compat = json.loads((Path(tmp) / "_outputs" / "findings_v8compat.json").read_text())
        return result, compat


class CompatProjection(unittest.TestCase):
    def test_every_emitted_finding_validates_against_vendored_base_schema(self):
        bundle = make_clean_review("ASC946")
        bundle["figures"] = mutate(bundle["figures"], "balance_sheet.partners_capital", 104000000.0)
        bundle["notes"]["notes"] = [n for n in bundle["notes"]["notes"] if "Fair value" not in n["title"]]
        _, compat = run_bundle(bundle)
        self.assertGreater(len(compat), 3)
        for cf in compat:
            self.assertEqual([], validate_v8compat(cf), cf.get("subagentRaw", "")[:80])

    def test_check_ref_translation(self):
        self.assertEqual("CHECK-3", base_check_ref("BS_BALANCE"))
        self.assertEqual("TIE-1", base_check_ref("SOI_TO_BS"))
        self.assertEqual("XLSX-1", base_check_ref("TIE_OUT:statement_of_changes.ending_capital"))
        self.assertIsNone(base_check_ref(None))

    def test_source_to_subagent_mapping_and_provenance_chain(self):
        v9 = {
            "id": "F-001", "source": "regulatory", "legacy_layer": "L12",
            "category": "regulatory_gap", "severity": "MEDIUM", "confidence_label": "PROBABLE",
            "confidence_calibrated": 0.85, "statement": "Notes to Financial Statements",
            "section": "Organization", "sort_order": 60,
            "location": {"statement": "Notes to Financial Statements", "line_id": None,
                         "note_id": None, "path": None},
            "message": "PFA reference missing.", "fix": "Add it.",
            "evidence": {"relationship": None, "lhs": None, "rhs": None, "delta": None,
                         "citation_key": "CIMA:PFA", "citation_verified": True,
                         "citation_source": "x", "quoted_text": "y"},
            "materiality": {"clearly_trivial": False}, "suppressed": False,
            "merge_key": "a::b::c::regulatory_gap", "framework": "ASC946",
            "reconciler": None, "skeptic": None, "state": "OPEN",
            "versions": {"engine": "9.1.0", "schema": "9.0", "adapter": "rule_based",
                         "model_pin": "claude-fable-5",
                         "prompt_versions": {"judges": "rb-9.0.0"}, "corpus_versions": {}},
        }
        cf = to_v8compat(v9)
        self.assertEqual("defense", cf["subagent"])
        self.assertEqual("L12", cf["layer"])
        self.assertEqual("CIMA:PFA", cf["evidence"]["regulatory_citation"])
        self.assertEqual(cf["subagentRaw"], v9["message"])
        self.assertEqual(cf["text"], v9["message"])   # no polish: text falls back to raw
        self.assertEqual([], validate_v8compat(cf))


class VoiceAnnotation(unittest.TestCase):
    def test_certain_hedged_text_polished(self):
        self.assertEqual("The total is misstated.", polish("The total may be misstated."))
        self.assertIsNone(polish("The total is misstated."))   # already clean: no-op

    def test_probable_findings_never_polished(self):
        findings = [{"confidence_label": "PROBABLE",
                     "message": "The disclosure may be inadequate."}]
        annotated, count = annotate(findings)
        self.assertEqual(0, count)
        self.assertIsNone(annotated[0]["voice_normalized"])

    def test_certain_findings_polished_and_counted(self):
        findings = [{"confidence_label": "CERTAIN",
                     "message": "It appears that the schedule total is wrong."}]
        annotated, count = annotate(findings)
        self.assertEqual(1, count)
        self.assertEqual("The schedule total is wrong.", annotated[0]["voice_normalized"])

    def test_polish_surfaces_in_compat_voiceNormalized(self):
        finding = {
            "id": "F-001", "source": "core", "legacy_layer": "L2",
            "category": "footing_break", "severity": "HIGH", "confidence_label": "CERTAIN",
            "confidence_calibrated": 0.99, "statement": "S", "section": "s", "sort_order": 1,
            "location": {"statement": "S", "line_id": None, "note_id": None, "path": None},
            "message": "It appears that the section does not foot.", "fix": "Refoot.",
            "evidence": {"relationship": "BS_ASSETS_FOOT", "lhs": 1.0, "rhs": 2.0, "delta": -1.0,
                         "citation_key": None, "citation_verified": None,
                         "citation_source": None, "quoted_text": None},
            "materiality": {"clearly_trivial": False}, "suppressed": False,
            "merge_key": "a::b::c::footing_break", "framework": "ASC946",
            "reconciler": None, "skeptic": None, "state": "OPEN",
            "versions": {"engine": "9.1.0", "schema": "9.0", "adapter": "rule_based",
                         "model_pin": "claude-fable-5", "prompt_versions": {},
                         "corpus_versions": {}},
        }
        annotated, _ = annotate([finding])
        cf = to_v8compat(annotated[0])
        self.assertEqual("It appears that the section does not foot.", cf["subagentRaw"])
        self.assertEqual("The section does not foot.", cf["voiceNormalized"])
        self.assertEqual("The section does not foot.", cf["text"])


class Escalation(unittest.TestCase):
    FW = select_framework(make_metadata("ASC946"))

    def _finding(self, merge_key, severity="MEDIUM"):
        return {
            "id": "F-000", "source": "standards", "category": "standards_gap",
            "severity": severity, "confidence_label": "PROBABLE",
            "confidence_calibrated": 0.85, "statement": "Notes to Financial Statements",
            "section": "Fair value measurements", "sort_order": 60,
            "location": {"statement": "Notes to Financial Statements"},
            "message": "m", "fix": "f", "evidence": {},
            "materiality": {"clearly_trivial": False}, "suppressed": False,
            "merge_key": merge_key, "framework": "ASC946", "reconciler": None,
            "versions": {"engine": "9.1.0", "schema": "9.0", "adapter": "rule_based",
                         "model_pin": "claude-fable-5"},
            "state": "OPEN",
        }

    def test_recurring_escalates_one_tier(self):
        prior = [{"merge_key": "k1", "state": "ACCEPTED"}]
        findings, log = apply_escalation([self._finding("k1")], prior, self.FW)
        current = [f for f in findings if not f.get("synthetic_resolved")]
        self.assertEqual("RECURRING", current[0]["prior_review_recurrence"])
        self.assertEqual("HIGH", current[0]["severity"])
        self.assertIn("RECURRING", [e.get("decision") for e in log])

    def test_regressed_escalates_and_triggers_controller(self):
        prior = [{"merge_key": "k1", "state": "RESOLVED"}]
        findings, _ = apply_escalation([self._finding("k1", "HIGH")], prior, self.FW)
        current = [f for f in findings if not f.get("synthetic_resolved")]
        self.assertEqual("REGRESSED", current[0]["prior_review_recurrence"])
        self.assertEqual("CRITICAL", current[0]["severity"])
        self.assertTrue(current[0]["controller_escalation"])

    def test_evergreen_skips_escalation_and_carries_reason(self):
        prior = [{"merge_key": "k1", "state": "OPEN", "evergreen_accepted": True,
                  "evergreen_acceptance_reason": "auditor accepted", "evergreen_acceptance_date": "2025-05-01"}]
        findings, _ = apply_escalation([self._finding("k1")], prior, self.FW)
        current = [f for f in findings if not f.get("synthetic_resolved")]
        self.assertEqual("EVERGREEN_ACCEPTED", current[0]["prior_review_recurrence"])
        self.assertEqual("MEDIUM", current[0]["severity"])   # no escalation
        self.assertEqual("auditor accepted", current[0]["evergreen_acceptance_reason"])

    def test_cleared_prior_emits_synthetic_resolved(self):
        prior = [{"merge_key": "gone", "state": "OPEN"}]
        findings, log = apply_escalation([self._finding("k1")], prior, self.FW)
        synthetic = [f for f in findings if f.get("synthetic_resolved")]
        self.assertEqual(1, len(synthetic))
        self.assertEqual("RESOLVED", synthetic[0]["state"])
        self.assertTrue(synthetic[0]["suppressed"])

    def test_evergreen_excluded_from_readiness(self):
        from run_review import compute_readiness
        cov = {"scope_coverage_pct": 1.0, "applicability_documented_pct": 1.0}
        f = self._finding("k1", "CRITICAL")
        f["prior_review_recurrence"] = "EVERGREEN_ACCEPTED"
        self.assertEqual("READY", compute_readiness([f], cov)["state"])

    def test_end_to_end_with_prior_findings_file(self):
        bundle = make_clean_review("ASC946")
        bundle["figures"]["tie_out"]["statement_of_changes.ending_capital"] = 102900000.0
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, bundle)
            first = run(tmp, load_config())
            tie = next(f for f in first["findings"]
                       if (f["evidence"].get("relationship") or "").startswith("TIE_OUT"))
            self.assertEqual("HIGH", tie["severity"])
            # Feed run 1's findings back as the prior review, finding ACCEPTED.
            prior = [dict(tie, state="ACCEPTED")]
            (Path(tmp) / "inputs" / "prior_findings.json").write_text(json.dumps(prior))
            second = run(tmp, load_config())
            tie2 = next(f for f in second["findings"]
                        if (f["evidence"].get("relationship") or "").startswith("TIE_OUT"))
            self.assertEqual("RECURRING", tie2["prior_review_recurrence"])
            self.assertEqual("CRITICAL", tie2["severity"])


class BoxAdapter(unittest.TestCase):
    class FakeBoxClient:
        """In-memory Box backed by a review bundle, speaking the MCP surface."""

        def __init__(self, bundle):
            self.files = {
                "_REVIEW-MANIFEST.json": json.dumps(bundle["manifest"]),
                "_FUND-METADATA.json": json.dumps(bundle["metadata"]),
                "figures.json": json.dumps(bundle["figures"]),
                "notes.json": json.dumps(bundle["notes"]),
            }

        def search_folders_by_name(self, name):
            return [{"id": "folder-1", "name": name,
                     "path": "Apollo-Fund-Reviews/AAA/COINV-A/2025-FY/Draft-1.1"}]

        def list_folder_content_by_folder_id(self, folder_id):
            if folder_id == "folder-1":
                return [{"type": "folder", "name": "inputs", "id": "inputs-1"}]
            return [{"type": "file", "name": n, "id": f"file-{n}"} for n in self.files]

        def get_file_content(self, file_id):
            return self.files[file_id.removeprefix("file-")]

    def test_box_discovery_resolves_full_review(self):
        bundle = make_clean_review("ASC946")
        review = load_review_from_box(self.FakeBoxClient(bundle),
                                      "Apollo-Fund-Reviews/AAA/COINV-A/2025-FY/Draft-1.1")
        self.assertEqual("GLD-FUND-A", review.metadata["fund_code"])
        self.assertIn("figures.json", review.raw_files)
        self.assertEqual([], review.degradation_chips)

    def test_missing_client_halts_loudly(self):
        with self.assertRaises(BoxUnreachable):
            load_review_from_box(None, "Apollo-Fund-Reviews/x")

    def test_missing_figures_in_box_halts(self):
        bundle = make_clean_review("ASC946")
        client = self.FakeBoxClient(bundle)
        del client.files["figures.json"]
        from ingest.discovery import HaltError
        with self.assertRaises(HaltError):
            load_review_from_box(client, "Apollo-Fund-Reviews/x")


class AuditTreeOutputs(unittest.TestCase):
    def test_audit_tree_path_convention(self):
        with tempfile.TemporaryDirectory() as tmp:
            review = Path(tmp) / "AAA" / "COINV-A" / "Draft-1.1"
            review.mkdir(parents=True)
            out = outputs_dir(review, {"output": {"mode": "audit_tree"}},
                              reviewer="ashinde", stamp="20260612-1830")
            self.assertEqual(review.parent / "_outputs" / "Draft-1.1" / "ashinde-20260612-1830", out)
            self.assertTrue(out.is_dir())

    def test_audit_tree_requires_reviewer_and_stamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                outputs_dir(tmp, {"output": {"mode": "audit_tree"}})

    def test_simple_mode_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(Path(tmp) / "_outputs", outputs_dir(tmp))


class CoverageSplit(unittest.TestCase):
    def test_clean_run_reports_both_percentages(self):
        result, _ = run_bundle(make_clean_review("ASC946"))
        cov = result["coverage"]
        self.assertEqual(1.0, cov["applicability_documented_pct"])
        # Prior figures absent: the YOY review degrades scope but stays >= 95%.
        self.assertGreaterEqual(cov["scope_coverage_pct"], 0.95)
        self.assertEqual("READY", result["verdict"]["state"])

    def test_l4_formatting_checks_fire(self):
        bundle = make_clean_review("ASC946")
        bundle["figures"]["financial_highlights"]["expense_ratio"] = 3.63
        result, _ = run_bundle(bundle)
        fmt = [f for f in result["findings"] if f["category"] == "formatting"]
        self.assertEqual(1, len(fmt))
        self.assertEqual("L4", fmt[0]["legacy_layer"])
        # 3.63 also breaks the recomputation: both views of the same defect.
        self.assertTrue(any(f["category"] == "ratio_break" for f in result["findings"]))


if __name__ == "__main__":
    unittest.main()
