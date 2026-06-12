"""Shared finding construction and note scanning for the judgment layer."""
from __future__ import annotations

import re

PROMPT_VERSION = "rb-9.0.0"

# Calibrated confidence by epistemic class of the check, not by vibes:
# structural facts read directly from figures are near-certain; absence of a
# text pattern in notes is probable (synonym phrasing is the skeptic's job).
CONFIDENCE = {
    "CERTAIN": 0.95,
    "PROBABLE": 0.85,
    "POSSIBLE": 0.65,
}


def find_note(notes: dict, title_patterns: list[str]):
    """First note whose title matches any pattern (case-insensitive)."""
    for note in notes.get("notes", []):
        title = note.get("title", "")
        for pat in title_patterns:
            if re.search(pat, title, re.IGNORECASE):
                return note
    return None


def note_matches_all(note: dict, text_patterns: list[str]) -> bool:
    text = note.get("text", "")
    return all(re.search(pat, text) for pat in text_patterns)


def scan_all_notes_for(notes: dict, text_patterns: list[str]) -> bool:
    """True when ANY note satisfies ALL text patterns. Used by the skeptic's
    synonym re-scan and by checks that accept the disclosure anywhere."""
    return any(note_matches_all(n, text_patterns) for n in notes.get("notes", []))


def make_finding(*, source: str, category: str, severity: str, confidence_label: str,
                 statement: str, section: str, sort_order: int, message: str, fix: str,
                 framework_code: str, versions: dict, line_id: str | None = None,
                 note_id: str | None = None, path: str | None = None,
                 citation_key: str | None = None, quoted_text: str | None = None,
                 lhs: float | None = None, rhs: float | None = None,
                 delta: float | None = None, relationship: str | None = None,
                 legacy_layer: str | None = None) -> dict:
    return {
        "id": "F-000",  # assigned after the deterministic global sort
        "source": source,
        "legacy_layer": legacy_layer,
        "category": category,
        "severity": severity,
        "confidence_label": confidence_label,
        "confidence_calibrated": CONFIDENCE[confidence_label],
        "statement": statement,
        "section": section,
        "sort_order": sort_order,
        "location": {"statement": statement, "line_id": line_id, "note_id": note_id, "path": path},
        "message": message,
        "fix": fix,
        "evidence": {
            "relationship": relationship, "lhs": lhs, "rhs": rhs, "delta": delta,
            "citation_key": citation_key, "citation_verified": None,
            "citation_source": None, "quoted_text": quoted_text,
        },
        "materiality": {"amount": abs(delta) if delta is not None else None,
                        "basis": None, "basis_amount": None, "ratio": None,
                        "clearly_trivial": False},
        "suppressed": False,
        "skeptic": None,
        "merge_key": f"{statement}::{section}::{line_id or note_id or 'note'}::{category}",
        "framework": framework_code,
        "reconciler": None,
        "versions": versions,
        "state": "OPEN",
    }


def checklist_walk(items: list[dict], notes: dict, framework, versions: dict,
                   *, kinds: tuple, source: str, legacy_layer: str) -> tuple[list[dict], dict]:
    """Walk checklist items of the given kinds against the notes.

    Returns (findings, coverage). Every item is either checked or skipped with
    a reason code; nothing is dropped silently.
    """
    findings, checked, skipped = [], [], []
    notes_stmt = framework.statement_name("notes")
    for idx, it in enumerate(i for i in items if i["kind"] in kinds):
        if not it["applicable"]:
            skipped.append({"check": it["check_id"], "reason_code": "NOT_APPLICABLE",
                            "reason": it["applicability_reason"]})
            continue
        checked.append(it["check_id"])
        note = None
        if it["require_text_patterns"] == ["__POSITION_AGGREGATED__"]:
            # The item itself encodes a violation computed from the figures.
            satisfied = False
        else:
            note = find_note(notes, it["note_title_patterns"])
            satisfied = bool(note and note_matches_all(note, it["require_text_patterns"]))
        if not satisfied:
            findings.append(make_finding(
                source=source, category="standards_gap" if source == "standards"
                else ("regulatory_gap" if source == "regulatory" else "disclosure_gap"),
                severity=it["severity"], confidence_label="PROBABLE",
                statement=notes_stmt if source != "standards" or "Schedule" not in it["section"]
                else framework.statement_name("soi"),
                section=it["section"], sort_order=60 + idx,
                message=it["message_missing"], fix=it["fix"],
                framework_code=framework.code, versions=versions,
                note_id=None, citation_key=it["citation_key"],
                legacy_layer=legacy_layer,
            ))
            # Skeptic hooks: which check produced this, and whether the note
            # existed (deficiency) or was absent entirely.
            findings[-1]["check_id"] = it["check_id"]
            findings[-1]["x_note_found"] = note is not None
    return findings, {"checked": checked, "skipped": skipped}
