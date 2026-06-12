"""Citation verifier: the gate between findings and the dashboard.

A standards or regulatory finding whose citation key does not resolve to real
corpus text is REJECTED and logged. Hallucinated citations are the single most
dangerous failure in an audit context; this module exists so they cannot reach
the controller.
"""
from __future__ import annotations

from evidence.corpus import CorpusIndex


class CitationVerifier:
    def __init__(self, index: CorpusIndex):
        self.index = index
        self.log: list[dict] = []

    def verify(self, citation_key: str) -> dict | None:
        """Return {key, source, snippet} when the key resolves; None otherwise.
        Every attempt is logged either way: the log is part of the audit trail."""
        entry = self.index.lookup(citation_key) if citation_key else None
        self.log.append({
            "citation_key": citation_key,
            "verified": entry is not None,
            "source": entry["source"] if entry else None,
        })
        return entry

    def stamp_finding(self, finding: dict) -> bool:
        """Verify and stamp a finding's citation in place.

        Returns True when the citation resolved (or none was required by the
        finding's source). Returns False when the finding must be rejected.
        """
        evidence = finding.setdefault("evidence", {})
        key = evidence.get("citation_key")
        if finding.get("source") not in ("standards", "regulatory"):
            return True
        entry = self.verify(key)
        if entry is None:
            evidence["citation_verified"] = False
            return False
        evidence["citation_verified"] = True
        evidence["citation_source"] = entry["source"]
        if not evidence.get("quoted_text"):
            evidence["quoted_text"] = entry["snippet"][:240]
        return True
