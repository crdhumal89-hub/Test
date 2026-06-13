"""SHINE v9 finding validator.

Stdlib-only enforcement of schema/finding_schema.json. Hand-rolled rather than
a jsonschema dependency so the engine carries zero third-party requirements.

The validator is the Stage-5a equivalent of the v8 orchestrator: a finding that
fails here is rejected, logged, and never reaches the dashboard or exports.
"""
from __future__ import annotations

SCHEMA_VERSION = "9.0"

SOURCES = {"core", "presentation", "disclosure", "standards", "comparative", "regulatory"}
CATEGORIES = {
    "footing_break", "balance_break", "tie_out_break", "rollforward_break", "ratio_break", "per_unit_break",
    "presentation_gap", "template_deviation", "disclosure_gap", "placeholder_text", "ghost_text", "entity_mismatch",
    "standards_gap", "comparative_movement", "inter_entity_break", "regulatory_gap", "formatting",
}
SEVERITIES = {"CRITICAL", "HIGH", "MEDIUM", "LOW"}
CONFIDENCE_LABELS = {"CERTAIN", "PROBABLE", "POSSIBLE"}
FRAMEWORKS = {"ASC946", "IFRS", "USGAAP"}
STATES = {"OPEN", "ACCEPTED", "RESOLVED", "DISCARDED"}
CITATION_REQUIRED_SOURCES = {"standards", "regulatory"}

REQUIRED_FIELDS = [
    "id", "source", "category", "severity", "confidence_label", "confidence_calibrated",
    "statement", "section", "sort_order", "location", "message", "fix",
    "merge_key", "framework", "materiality", "suppressed", "versions", "state",
]
REQUIRED_VERSION_FIELDS = ["engine", "schema", "adapter", "model_pin"]


class ValidationError(Exception):
    """Raised by validate_or_raise when a finding violates the v9 schema."""


def validate_finding(finding: dict) -> list[str]:
    """Return a list of violations. Empty list means the finding is valid."""
    errs: list[str] = []
    if not isinstance(finding, dict):
        return ["finding is not an object"]

    for field in REQUIRED_FIELDS:
        if field not in finding:
            errs.append(f"missing required field: {field}")
    if errs:
        return errs

    fid = finding["id"]
    if not (isinstance(fid, str) and fid.startswith("F-") and fid[2:].isdigit() and len(fid) >= 5):
        errs.append(f"id must match F-NNN, got: {fid!r}")
    if finding["source"] not in SOURCES:
        errs.append(f"source not in enum: {finding['source']!r}")
    if finding["category"] not in CATEGORIES:
        errs.append(f"category not in enum: {finding['category']!r}")
    if finding["severity"] not in SEVERITIES:
        errs.append(f"severity not in enum: {finding['severity']!r}")
    if finding["confidence_label"] not in CONFIDENCE_LABELS:
        errs.append(f"confidence_label not in enum: {finding['confidence_label']!r}")
    cc = finding["confidence_calibrated"]
    if not (isinstance(cc, (int, float)) and 0 <= cc <= 1):
        errs.append(f"confidence_calibrated must be a number in [0,1], got: {cc!r}")
    if not (isinstance(finding["statement"], str) and finding["statement"]):
        errs.append("statement must be a non-empty string")
    if not (isinstance(finding["section"], str) and finding["section"]):
        errs.append("section must be a non-empty string")
    if not (isinstance(finding["sort_order"], int) and finding["sort_order"] >= 0):
        errs.append("sort_order must be a non-negative integer")

    loc = finding["location"]
    if not (isinstance(loc, dict) and isinstance(loc.get("statement"), str) and loc.get("statement")):
        errs.append("location must be an object with a non-empty statement")

    if not (isinstance(finding["message"], str) and finding["message"]):
        errs.append("message must be a non-empty string")
    if not (isinstance(finding["fix"], str) and finding["fix"]):
        errs.append("fix must be a non-empty string")

    mk = finding["merge_key"]
    if not (isinstance(mk, str) and mk.count("::") == 3):
        errs.append(f"merge_key must have four ::-separated parts, got: {mk!r}")
    if finding["framework"] not in FRAMEWORKS:
        errs.append(f"framework not in enum: {finding['framework']!r}")
    if finding["state"] not in STATES:
        errs.append(f"state not in enum: {finding['state']!r}")

    mat = finding["materiality"]
    if not (isinstance(mat, dict) and isinstance(mat.get("clearly_trivial"), bool)):
        errs.append("materiality must be an object with boolean clearly_trivial")
    if not isinstance(finding["suppressed"], bool):
        errs.append("suppressed must be boolean")

    versions = finding["versions"]
    if not isinstance(versions, dict):
        errs.append("versions must be an object")
    else:
        for vf in REQUIRED_VERSION_FIELDS:
            if not (isinstance(versions.get(vf), str) and versions.get(vf)):
                errs.append(f"versions.{vf} must be a non-empty string")

    # Citation discipline: standards and regulatory findings must carry a
    # VERIFIED citation. Presence alone is not enough in v9.
    if finding["source"] in CITATION_REQUIRED_SOURCES:
        ev = finding.get("evidence") or {}
        if not ev.get("citation_key"):
            errs.append(f"source={finding['source']} requires evidence.citation_key")
        if ev.get("citation_verified") is not True:
            errs.append(f"source={finding['source']} requires evidence.citation_verified=true")

    # Arithmetic discipline: core findings are CERTAIN by construction and
    # must carry the exact relationship and numbers.
    if finding["source"] == "core":
        if finding["confidence_label"] != "CERTAIN":
            errs.append("core findings must be CERTAIN")
        ev = finding.get("evidence") or {}
        if not ev.get("relationship"):
            errs.append("core findings must carry evidence.relationship")
        for num_field in ("lhs", "rhs", "delta"):
            if not isinstance(ev.get(num_field), (int, float)):
                errs.append(f"core findings must carry numeric evidence.{num_field}")

    # Generated-artifact hygiene: no em dashes in any text the engine emits.
    for text_field in ("message", "fix", "statement", "section"):
        value = finding.get(text_field)
        if isinstance(value, str) and "—" in value:
            errs.append(f"{text_field} contains an em dash, which is forbidden in generated output")

    return errs


def validate_or_raise(finding: dict) -> None:
    errs = validate_finding(finding)
    if errs:
        raise ValidationError(f"finding {finding.get('id', '?')}: " + "; ".join(errs))


def validate_all(findings: list[dict]) -> tuple[list[dict], list[dict]]:
    """Split findings into (valid, rejected). Rejected entries carry their reasons."""
    valid, rejected = [], []
    for f in findings:
        errs = validate_finding(f)
        if errs:
            rejected.append({"finding": f, "reasons": errs})
        else:
            valid.append(f)
    return valid, rejected
