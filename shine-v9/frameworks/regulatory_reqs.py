"""Jurisdiction-driven regulatory requirements (framework-independent).

The regulatory judge walks these. Every item carries a corpus citation key
verified by the evidence layer; v8 invariant 13 carried into v9 with
verification as the bar.
"""
from __future__ import annotations

from frameworks.base import item


def build_regulatory_checklist(metadata: dict) -> list[dict]:
    jurisdictions = set(metadata.get("regulatory_jurisdictions", []))
    domicile = metadata.get("domicile", "")
    items = []

    if "CIMA" in jurisdictions or domicile == "Cayman Islands":
        items.append(item(
            "REG_CIMA_PFA", "standards",
            bool(metadata.get("formed_after_2020", False)),
            "Cayman closed-end fund formed after 2020 registers under the Private Funds Act",
            citation_key="CIMA:PFA",
            note_title_patterns=[r"organization|organisation"],
            require_text_patterns=[r"Private Funds Act|CIMA|Cayman Islands Monetary Authority"],
            severity="MEDIUM", section="Organization",
            message_missing="The organization note does not reference Cayman Private Funds Act registration, which is the standard expectation for a post-2020 Cayman fund.",
            fix="Add the PFA registration statement with the registration number to the organization note."))

    if "CSSF" in jurisdictions or domicile == "Luxembourg":
        items.append(item(
            "REG_LUX_CSSF", "standards",
            True, "Luxembourg vehicle subject to CSSF supervision and RCS filing",
            citation_key="CSSF:SUPERVISION",
            note_title_patterns=[r"organization|organisation"],
            require_text_patterns=[r"CSSF|Commission de Surveillance"],
            severity="MEDIUM", section="Organization",
            message_missing="The organization note does not reference CSSF supervision or the RCS annual accounts filing obligation expected for a Luxembourg vehicle.",
            fix="Add the CSSF supervision and RCS filing references to the organization note."))

    if metadata.get("adviser_sec_registered", False):
        items.append(item(
            "REG_SEC_CUSTODY", "standards",
            True, "fund advised by an SEC-registered adviser relies on the audit exception",
            citation_key="SEC:RULE-206-4-2",
            note_title_patterns=[r"organization|organisation|polic"],
            require_text_patterns=[r"audit|audited"],
            severity="LOW", section="Organization",
            message_missing="The statements do not reference the annual audit on which the adviser's custody rule reliance rests.",
            fix="Confirm the audited-statement distribution timeline against Rule 206(4)-2 and reference the audit in the notes."))
    return items
