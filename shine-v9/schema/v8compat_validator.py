"""Validator for the BASE (v8.1.1-rc) finding shape.

Driven by the vendored schema file (finding_schema_v8compat.json) so the
contract this projection must honor is the literal artifact from the BASE
skill, not a paraphrase.
"""
from __future__ import annotations

import json
from pathlib import Path

_SCHEMA = json.loads((Path(__file__).parent / "finding_schema_v8compat.json")
                     .read_text(encoding="utf-8"))
REQUIRED = list(_SCHEMA.get("required", []))
_PROPS = _SCHEMA.get("properties", {})

SUBAGENTS = set(_PROPS.get("subagent", {}).get("enum",
                ["mechanical", "narrative", "standards", "comparative", "defense"]))
SEVERITIES = set(_PROPS.get("severity", {}).get("enum",
                 ["CRITICAL", "HIGH", "MEDIUM", "LOW"]))
CONFIDENCES = set(_PROPS.get("confidence", {}).get("enum",
                  ["CERTAIN", "PROBABLE", "POSSIBLE"]))
STATES = set(_PROPS.get("state", {}).get("enum",
             ["OPEN", "ACCEPTED", "RESOLVED", "DISCARDED"]))


def validate_v8compat(finding: dict) -> list[str]:
    errs = []
    for field in REQUIRED:
        if field not in finding or finding[field] is None:
            errs.append(f"missing required BASE field: {field}")
    if errs:
        return errs
    if finding["subagent"] not in SUBAGENTS:
        errs.append(f"subagent not in BASE enum: {finding['subagent']!r}")
    if finding["severity"] not in SEVERITIES:
        errs.append(f"severity not in BASE enum: {finding['severity']!r}")
    if finding["confidence"] not in CONFIDENCES:
        errs.append(f"confidence not in BASE enum: {finding['confidence']!r}")
    if finding["state"] not in STATES:
        errs.append(f"state not in BASE enum: {finding['state']!r}")
    if not isinstance(finding["sortOrder"], int):
        errs.append("sortOrder must be an integer")
    if not (isinstance(finding["location"], dict) and finding["location"].get("statement")):
        errs.append("location must be an object with a statement")
    if not isinstance(finding["reference_versions"], dict):
        errs.append("reference_versions must be an object")
    # BASE invariant 13: L9 cites the ASC paragraph, L12 cites the corpus key.
    layer = finding.get("layer")
    ev = finding.get("evidence") or {}
    if layer == "L9" and not ev.get("asc_reference"):
        errs.append("L9 finding missing evidence.asc_reference (BASE invariant 13)")
    if layer == "L12" and not ev.get("regulatory_citation"):
        errs.append("L12 finding missing evidence.regulatory_citation (BASE invariant 13)")
    return errs
