"""The adversarial pass: argue the contrary case before findings ship.

Strategies, in order:
1. Synonym re-scan. The judges find notes by title patterns; a disclosure
   living under unconventional phrasing (a "Valuation" note carrying the full
   fair value hierarchy) is the classic false positive. The skeptic re-scans
   EVERY note with a broadened pattern set; a hit drops the finding.
2. Applicability re-verification. A standards finding whose trigger flag is
   not actually present in the figures is dropped.
3. Deficiency demotion. When the note exists but its content is incomplete,
   the issue is deficiency, not absence: severity demotes one notch and the
   message is qualified.

Core findings are NEVER challenged: arithmetic is machine-certain and not
arguable. Every decision is appended to the skeptic log; nothing is dropped
silently.
"""
from __future__ import annotations

from frameworks.base import derive_flags
from judges.common import scan_all_notes_for

# Broadened synonym sets per check id. ALL patterns in a set must match a
# single note for the contrary case to win.
SYNONYMS = {
    "ASC946_HIERARCHY_TABLE": [r"(?i)level\s*1", r"(?i)level\s*2", r"(?i)level\s*3"],
    "USGAAP_HIERARCHY_TABLE": [r"(?i)level\s*1", r"(?i)level\s*2", r"(?i)level\s*3"],
    "IFRS13_HIERARCHY": [r"(?i)level\s*1", r"(?i)level\s*2", r"(?i)level\s*3"],
    "ASC946_LEVEL3_ROLLFORWARD": [r"(?i)level\s*3", r"(?i)reconcil|roll[\s-]?forward|opening balance|beginning balance|activity"],
    "USGAAP_LEVEL3_ROLLFORWARD": [r"(?i)level\s*3", r"(?i)reconcil|roll[\s-]?forward|opening balance|beginning balance|activity"],
    "IFRS13_LEVEL3_RECON": [r"(?i)level\s*3", r"(?i)reconcil|roll[\s-]?forward|opening balance|beginning balance|activity"],
    "ASC946_LEVEL3_INPUTS": [r"(?i)unobservable", r"(?i)range|weighted average"],
    "ASC946_RELATED_PARTY": [r"(?i)management fee|affiliate|general partner|advisory fee"],
    "IFRS_RELATED_PARTY": [r"(?i)management fee|affiliate|general partner|advisory fee"],
    "USGAAP_RELATED_PARTY": [r"(?i)management fee|affiliate|general partner|advisory fee"],
    "REG_CIMA_PFA": [r"(?i)Private Funds Act|Cayman Islands Monetary Authority|CIMA"],
    "REG_LUX_CSSF": [r"(?i)CSSF|Commission de Surveillance|surveillance du secteur"],
}

# Applicability flag a standards check depends on; absent flag drops the finding.
TRIGGER_FLAGS = {
    "ASC946_LEVEL3_ROLLFORWARD": "has_level3",
    "ASC946_LEVEL3_INPUTS": "has_level3",
    "USGAAP_LEVEL3_ROLLFORWARD": "has_level3",
    "IFRS13_LEVEL3_RECON": "has_level3",
    "ASC946_DERIVATIVES_VOLUME": "has_derivatives",
    "ASC946_HIERARCHY_TABLE": "has_investments",
    "IFRS13_HIERARCHY": "has_investments",
    "USGAAP_HIERARCHY_TABLE": "has_investments",
}

DEMOTION = {"CRITICAL": "HIGH", "HIGH": "MEDIUM", "MEDIUM": "LOW", "LOW": "LOW"}


def run_skeptic(findings: list[dict], ctx: dict, config: dict) -> tuple[list[dict], list[dict]]:
    """Challenge CRITICAL/HIGH judgment findings. Returns (surviving, log)."""
    skeptic_cfg = config.get("skeptic", {})
    if not skeptic_cfg.get("enabled", True):
        return findings, [{"decision": "skeptic disabled by config; no findings challenged"}]

    challenge_severities = set(skeptic_cfg.get("challenge_severities", ["CRITICAL", "HIGH"]))
    notes = ctx["notes"]
    flags = derive_flags(ctx["figures"])
    surviving, log = [], []

    for finding in findings:
        if finding["source"] == "core":
            surviving.append(finding)   # arithmetic is not arguable
            continue
        if finding["severity"] not in challenge_severities:
            surviving.append(finding)
            continue

        check_id = finding.get("check_id")
        challenged = {"finding_message": finding["message"][:140],
                      "check_id": check_id, "severity": finding["severity"]}

        # Strategy 2: applicability trigger re-verification.
        flag_name = TRIGGER_FLAGS.get(check_id)
        if flag_name is not None and not flags.get(flag_name, False):
            challenged.update(outcome="dropped",
                              rationale=f"applicability trigger {flag_name} is not present in the figures; the requirement does not bite")
            log.append(challenged)
            finding["skeptic"] = {"challenged": True, "outcome": "dropped",
                                  "rationale": challenged["rationale"]}
            continue

        # Strategy 1: synonym re-scan across every note.
        synonyms = SYNONYMS.get(check_id)
        if synonyms and scan_all_notes_for(notes, synonyms):
            challenged.update(outcome="dropped",
                              rationale="the disclosure exists under alternative phrasing; located by synonym re-scan across all notes")
            log.append(challenged)
            finding["skeptic"] = {"challenged": True, "outcome": "dropped",
                                  "rationale": challenged["rationale"]}
            continue

        # Strategy 3: deficiency, not absence.
        if finding.get("x_note_found") and finding["severity"] == "CRITICAL":
            new_severity = DEMOTION[finding["severity"]]
            challenged.update(outcome="demoted",
                              rationale=f"the note exists; the issue is content deficiency, not absence. Severity {finding['severity']} demoted to {new_severity}")
            log.append(challenged)
            finding["severity"] = new_severity
            finding["skeptic"] = {"challenged": True, "outcome": "demoted",
                                  "rationale": challenged["rationale"]}
            surviving.append(finding)
            continue

        # Upheld: the contrary case failed.
        challenged.update(outcome="upheld", rationale="contrary case failed; finding stands")
        log.append(challenged)
        finding["skeptic"] = {"challenged": True, "outcome": "upheld",
                              "rationale": challenged["rationale"]}
        finding["confidence_calibrated"] = min(0.99, finding["confidence_calibrated"] + 0.05)
        surviving.append(finding)

    return surviving, log
