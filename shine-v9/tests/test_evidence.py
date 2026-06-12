"""Phase 4 suite: corpus loading, retrieval, and citation verification.

The meta-test at the bottom is the drift killer: every citation key used by
every framework engine and the regulatory checklist must resolve against the
loaded corpus. A checklist edit that references a nonexistent authority becomes
a test failure, not a production rejection.
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from evidence.corpus import load_corpus, normalize_key       # noqa: E402
from evidence.verifier import CitationVerifier                # noqa: E402
from frameworks.registry import select_framework              # noqa: E402
from frameworks.regulatory_reqs import build_regulatory_checklist  # noqa: E402
from harness.fixture_factory import make_clean_figures, make_metadata  # noqa: E402

CORPUS_PATHS = ["../shine-fs-review-v8/reference", "evidence/corpus_data"]


def corpus():
    return load_corpus(ROOT, CORPUS_PATHS)


class Normalization(unittest.TestCase):
    def test_equivalent_forms_normalize_identically(self):
        self.assertEqual(normalize_key("ASC 820-10-50-2(c)"), normalize_key("820-10-50-2C"))
        self.assertEqual(normalize_key("IFRS 13.93(e)"), normalize_key("ifrs 13.93(E)"))


class Loading(unittest.TestCase):
    def test_v8_asc_corpus_indexed(self):
        idx = corpus()
        self.assertIsNotNone(idx.lookup("ASC 820-10-50-2(c)"))
        self.assertIsNotNone(idx.lookup("ASC 946-205-45-1"))
        self.assertIsNotNone(idx.lookup("ASC 855-10-50-4"))

    def test_v8_regulatory_index_loaded(self):
        idx = corpus()
        self.assertIsNotNone(idx.lookup("CIMA:PFA"))
        self.assertIsNotNone(idx.lookup("SEC:RULE-206-4-2"))

    def test_v9_corpus_additions_loaded(self):
        idx = corpus()
        self.assertIsNotNone(idx.lookup("IFRS 13.93(e)"))
        self.assertIsNotNone(idx.lookup("IAS 1.10"))
        self.assertIsNotNone(idx.lookup("CSSF:SUPERVISION"))
        self.assertIsNotNone(idx.lookup("ASC 230-10-15-1"))

    def test_snippets_sanitized_no_em_dash(self):
        idx = corpus()
        for entry in idx.entries.values():
            self.assertNotIn("—", entry["snippet"], f"em dash leaked from {entry['source']}")

    def test_corpus_files_hashed_for_ledger(self):
        idx = corpus()
        self.assertGreater(len(idx.file_hashes), 3)


class Verification(unittest.TestCase):
    def test_real_citation_passes_and_stamps(self):
        v = CitationVerifier(corpus())
        finding = {"source": "standards",
                   "evidence": {"citation_key": "ASC 820-10-50-2(c)"}}
        self.assertTrue(v.stamp_finding(finding))
        self.assertTrue(finding["evidence"]["citation_verified"])
        self.assertTrue(finding["evidence"]["quoted_text"])

    def test_fabricated_citation_rejected_and_logged(self):
        v = CitationVerifier(corpus())
        finding = {"source": "standards",
                   "evidence": {"citation_key": "ASC 999-99-99-99"}}
        self.assertFalse(v.stamp_finding(finding))
        self.assertFalse(finding["evidence"]["citation_verified"])
        self.assertEqual(1, len([e for e in v.log if not e["verified"]]))

    def test_missing_citation_on_regulatory_finding_rejected(self):
        v = CitationVerifier(corpus())
        finding = {"source": "regulatory", "evidence": {}}
        self.assertFalse(v.stamp_finding(finding))

    def test_core_finding_passes_without_citation(self):
        v = CitationVerifier(corpus())
        finding = {"source": "core", "evidence": {}}
        self.assertTrue(v.stamp_finding(finding))


class Retrieval(unittest.TestCase):
    def test_keyword_search_is_deterministic_and_relevant(self):
        idx = corpus()
        first = idx.search(["level 3", "reconciliation"])
        second = idx.search(["level 3", "reconciliation"])
        self.assertEqual([e["key"] for e in first], [e["key"] for e in second])
        self.assertTrue(first, "expected at least one retrieval hit")


class ChecklistCorpusDrift(unittest.TestCase):
    def test_every_framework_citation_resolves(self):
        idx = corpus()
        figures = make_clean_figures()
        missing = []
        for code in ("ASC946", "IFRS", "USGAAP"):
            metadata = make_metadata(code)
            engine = select_framework(metadata)
            for st in engine.required_statements(figures):
                if st.get("citation_key") and not idx.lookup(st["citation_key"]):
                    missing.append((code, st["citation_key"]))
            for it in engine.checklist(figures, metadata):
                if it["citation_key"] and not idx.lookup(it["citation_key"]):
                    missing.append((code, it["citation_key"]))
        for domicile in ("Cayman Islands", "Luxembourg", "Delaware"):
            for it in build_regulatory_checklist(make_metadata(domicile=domicile)):
                if it["citation_key"] and not idx.lookup(it["citation_key"]):
                    missing.append(("REG", it["citation_key"]))
        self.assertEqual([], missing, f"checklist citations missing from corpus: {missing}")


if __name__ == "__main__":
    unittest.main()
