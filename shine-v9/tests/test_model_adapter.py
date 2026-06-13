"""Model-path tests: the claude adapter runs end to end, offline, via replay.

These prove the integration is complete and tested without a live model: the
only thing a live run adds is a real network call inside ModelClient.complete.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from run_review import run, load_config                          # noqa: E402
from judges.adapter import (ClaudeAdapter, ReplayClient, make_adapter,
                            AdapterNotConfigured, parse_model_findings)  # noqa: E402
from frameworks.registry import select_framework                  # noqa: E402
from harness.fixture_factory import (make_clean_review, make_metadata,
                                     write_review_folder)           # noqa: E402


def claude_config(cassette):
    cfg = load_config()
    cfg["adapter"] = "claude"
    cfg["replay_cassette"] = cassette
    return cfg


class AdapterWiring(unittest.TestCase):
    def test_claude_without_client_or_replay_halts(self):
        import os
        self.assertNotIn("ANTHROPIC_API_KEY", os.environ)
        with self.assertRaises(AdapterNotConfigured):
            make_adapter({"adapter": "claude", "model_pin": "claude-fable-5"})

    def test_replay_cassette_builds_a_claude_adapter(self):
        adapter = make_adapter({"adapter": "claude", "model_pin": "x", "replay_cassette": {}})
        self.assertIsInstance(adapter, ClaudeAdapter)

    def test_replay_client_keys_on_reviewer_name(self):
        client = ReplayClient({"standards": json.dumps({"findings": [{"x": 1}]})})
        self.assertIn('"x": 1', client.complete("REVIEWER: standards\n..."))
        self.assertEqual(ReplayClient.EMPTY, client.complete("REVIEWER: disclosure\n..."))


class ParseModelFindings(unittest.TestCase):
    def _ctx(self):
        bundle = make_clean_review("ASC946")
        return {"framework": select_framework(bundle["metadata"]),
                "versions": {"engine": "9.1.0", "schema": "9.0", "adapter": "claude",
                             "model_pin": "claude-fable-5", "prompt_versions": {}, "corpus_versions": {}}}

    def test_wellformed_entry_becomes_v9_finding(self):
        raw = json.dumps({"findings": [{
            "statement": "Notes to Financial Statements", "section": "Fair value measurements",
            "message": "The sensitivity narrative is boilerplate.", "fix": "Add entity-specific sensitivity.",
            "severity": "MEDIUM", "confidence_label": "PROBABLE", "category": "standards_gap",
            "citation_key": "ASC 820-10-50-2(g)"}]})
        out = parse_model_findings(raw, "standards", self._ctx())
        self.assertEqual(1, len(out))
        self.assertEqual("standards", out[0]["source"])
        self.assertEqual("L9", out[0]["legacy_layer"])
        self.assertTrue(out[0]["model_generated"])

    def test_malformed_entries_dropped_not_crashing(self):
        ctx = self._ctx()
        self.assertEqual([], parse_model_findings("not json", "standards", ctx))
        self.assertEqual([], parse_model_findings(json.dumps({"findings": [{"message": "no other fields"}]}),
                                                  "standards", ctx))
        self.assertEqual([], parse_model_findings(json.dumps({"findings": ["string not object"]}),
                                                  "standards", ctx))


class EndToEndReplay(unittest.TestCase):
    def test_model_added_finding_with_valid_citation_reaches_output(self):
        bundle = make_clean_review("ASC946")
        cassette = {"standards": json.dumps({"findings": [{
            "statement": "Notes to Financial Statements", "section": "Fair value measurements",
            "message": "The valuation process narrative is generic boilerplate rather than entity-specific.",
            "fix": "Describe the Fund's specific valuation governance and committee process.",
            "severity": "MEDIUM", "confidence_label": "PROBABLE", "category": "standards_gap",
            "citation_key": "ASC 820-10-50-2(g)"}]})}
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, bundle)
            result = run(tmp, claude_config(cassette))
            findings = json.loads((Path(tmp) / "_outputs" / "findings.json").read_text())
        model_findings = [f for f in findings if f.get("model_generated")]
        self.assertEqual(1, len(model_findings))
        mf = model_findings[0]
        self.assertEqual("standards", mf["source"])
        self.assertTrue(mf["evidence"]["citation_verified"])   # passed verification
        # It was challenged by the skeptic and survived (a true gap on the
        # clean draft's generic note), or was dropped if the synonym re-scan
        # found it. Either way it is schema-valid and the run did not crash.
        from schema.validator import validate_finding
        self.assertEqual([], validate_finding(mf))

    def test_model_finding_with_fabricated_citation_is_rejected(self):
        bundle = make_clean_review("ASC946")
        cassette = {"standards": json.dumps({"findings": [{
            "statement": "Notes to Financial Statements", "section": "Fair value measurements",
            "message": "Invented requirement.", "fix": "Do the invented thing.",
            "severity": "HIGH", "confidence_label": "PROBABLE", "category": "standards_gap",
            "citation_key": "ASC 999-99-99-99(z)"}]})}
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, bundle)
            result = run(tmp, claude_config(cassette))
            findings = json.loads((Path(tmp) / "_outputs" / "findings.json").read_text())
            rejected = json.loads((Path(tmp) / "_outputs" / "rejected_findings.json").read_text())
        self.assertEqual([], [f for f in findings if f.get("model_generated")])
        self.assertTrue(any("Invented requirement" in r["finding"].get("message", "")
                            for r in rejected),
                        "fabricated-citation model finding must be in the rejected log")

    def test_model_does_not_double_count_a_floor_finding(self):
        # The model echoes a gap the rules already detect (missing FV note);
        # dedup by merge_key must keep exactly one.
        bundle = make_clean_review("ASC946")
        bundle["notes"]["notes"] = [n for n in bundle["notes"]["notes"] if "Fair value" not in n["title"]]
        fw = select_framework(bundle["metadata"])
        # Reproduce the rule finding's merge_key for the hierarchy check.
        merge_key = f"{fw.statement_name('notes')}::Fair value measurements::ASC946_HIERARCHY_TABLE::standards_gap"
        cassette = {"standards": json.dumps({"findings": [{
            "statement": fw.statement_name("notes"), "section": "Fair value measurements",
            "message": "Hierarchy table missing (model echo).", "fix": "Add it.",
            "severity": "CRITICAL", "confidence_label": "PROBABLE", "category": "standards_gap",
            "citation_key": "ASC 820-10-50-2(b)"}]})}
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, bundle)
            run(tmp, claude_config(cassette))
            findings = json.loads((Path(tmp) / "_outputs" / "findings.json").read_text())
        echoes = [f for f in findings if "model echo" in f.get("message", "")]
        self.assertEqual([], echoes, "model echo of a floor finding should be deduped out")

    def test_clean_draft_with_empty_cassette_stays_ready(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_review_folder(tmp, make_clean_review("ASC946"))
            result = run(tmp, claude_config({}))
            self.assertEqual("READY", result["verdict"]["state"])
            self.assertEqual([], result["findings"])


if __name__ == "__main__":
    unittest.main()
