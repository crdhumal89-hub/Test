"""BASE-shape (v8.1.1-rc) compatibility projection.

v9 emits findings in two shapes on every run:

  findings.json          the v9 calibrated form (source, confidence_calibrated,
                         materiality, suppressed, nested versions)
  findings_v8compat.json the BASE shape every v8.1.1-rc consumer expects
                         (subagent, subagentRaw / voiceNormalized /
                         controllerEdited provenance chain, layer, sortOrder,
                         top-level version stamps, evidence.expected_value /
                         found_value, check_ref)

The projection is total: every BASE required field is populated, validated by
v8compat_validator against the vendored BASE schema in CI. Nothing is lost in
the v9 form; the compat form is a faithful re-keying plus the published
check-id translation (schema/check_id_map.json).
"""
from __future__ import annotations

import json
from pathlib import Path

_MAP = json.loads((Path(__file__).parent / "check_id_map.json").read_text(encoding="utf-8"))
RELATIONSHIP_TO_BASE = _MAP["relationship_to_base"]
SOURCE_TO_SUBAGENT = _MAP["source_to_subagent"]
SOURCE_TO_LAYER = _MAP["source_to_default_layer"]


def base_check_ref(relationship: str | None) -> str | None:
    if not relationship:
        return None
    if relationship.startswith("TIE_OUT:"):
        return RELATIONSHIP_TO_BASE["TIE_OUT"]
    return RELATIONSHIP_TO_BASE.get(relationship)


def to_v8compat(finding: dict) -> dict:
    ev = finding.get("evidence") or {}
    citation = ev.get("citation_key")
    relationship = ev.get("relationship")
    constituents = (finding.get("reconciler") or {}).get("constituents") or []
    detail_parts = []
    if finding.get("suppressed"):
        detail_parts.append("Suppressed as clearly trivial; retained in the audit trail.")
    if constituents:
        detail_parts.append(
            "Reconciler root cause; constituents: "
            + "; ".join(f"[{c.get('source', '?')}] {c.get('message', '')[:90]}" for c in constituents))
    skeptic = finding.get("skeptic")
    if skeptic:
        detail_parts.append(f"Skeptic {skeptic['outcome']}: {skeptic['rationale']}")

    versions = finding.get("versions") or {}
    return {
        "id": finding["id"],
        "subagent": SOURCE_TO_SUBAGENT[finding["source"]],
        "subagent_version": versions.get("engine", ""),
        "prompt_version": versions.get("prompt_versions", {}).get("judges", ""),
        "reference_versions": versions.get("corpus_versions", {}),
        "layer": finding.get("legacy_layer") or SOURCE_TO_LAYER[finding["source"]],
        "section": finding["section"],
        "sortOrder": finding["sort_order"],
        "statement": finding["statement"],
        "severity": finding["severity"],
        "confidence": finding["confidence_label"],
        "state": finding["state"],
        "subagentRaw": finding["message"],
        "voiceNormalized": finding.get("voice_normalized"),
        "controllerEdited": None,
        "text": finding.get("voice_normalized") or finding["message"],
        "fix": finding["fix"],
        "fixSubagentRaw": finding["fix"],
        "fixVoiceNormalized": None,
        "fixControllerEdited": None,
        "location": dict(finding["location"]),
        "evidence": {
            "check_ref": base_check_ref(relationship),
            "expected_value": ev.get("rhs"),
            "found_value": ev.get("lhs"),
            "asc_reference": citation if (citation or "").startswith(("ASC", "IFRS", "IAS")) else None,
            "regulatory_citation": citation if ":" in (citation or "") else None,
            "citation_verified": ev.get("citation_verified"),
            "quoted_text": ev.get("quoted_text"),
        },
        "detail": " ".join(detail_parts) if detail_parts else None,
        "constituent_findings": [f"{finding['id']}-c{i + 1}" for i in range(len(constituents))],
        "reconciler_pattern": (finding.get("reconciler") or {}).get("pattern"),
        "reconciler_specificity_score": (finding.get("reconciler") or {}).get("score"),
        "hidden_row_flag": False,
        "prior_review_recurrence": finding.get("prior_review_recurrence") or "NEW",
        "evergreen_accepted": bool(finding.get("evergreen_accepted", False)),
        "evergreen_acceptance_reason": finding.get("evergreen_acceptance_reason"),
        "evergreen_acceptance_date": finding.get("evergreen_acceptance_date"),
        "merge_key": finding["merge_key"],
        "controller_question": None,
    }


def project_all(findings: list[dict]) -> list[dict]:
    return [to_v8compat(f) for f in findings]
