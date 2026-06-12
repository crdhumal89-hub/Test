"""Prior-review escalation: the BASE Stage 5f matrix carried into v9.

When prior_findings.json is supplied (the findings.json of the previous SHINE
run on the same fund), every current finding is matched against the prior set
by merge_key:

  NEW                 no prior match. No escalation.
  RECURRING           prior state OPEN or ACCEPTED. Flagged before, not fixed:
                      impact escalates one tier (cap CRITICAL).
  REGRESSED           prior state RESOLVED. Someone believed it fixed and it
                      came back: impact escalates one tier and the finding is
                      a controller-escalation trigger.
  EVERGREEN_ACCEPTED  prior finding carried evergreen_accepted. Escalation is
                      skipped, the acceptance reason and date carry forward,
                      and the finding is excluded from the readiness count.

Prior findings absent from the current run are emitted as synthetic RESOLVED
entries for the dashboard audit trail (never counted toward readiness, never
in the preparer export). Every decision lands in the escalation log.

Accepts prior findings in either shape: v9 (message/merge_key/state) or BASE
(subagentRaw/merge_key/state); only merge_key, state and the evergreen fields
are read.
"""
from __future__ import annotations

ESCALATE = {"LOW": "MEDIUM", "MEDIUM": "HIGH", "HIGH": "CRITICAL", "CRITICAL": "CRITICAL"}


def _prior_index(prior_findings: list[dict]) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for p in prior_findings or []:
        key = p.get("merge_key")
        if key and key not in index:
            index[key] = p
    return index


def apply_escalation(findings: list[dict], prior_findings: list[dict] | None,
                     framework) -> tuple[list[dict], list[dict]]:
    """Returns (findings_including_synthetic_resolved, escalation_log)."""
    log: list[dict] = []
    if not prior_findings:
        for f in findings:
            f["prior_review_recurrence"] = "NEW"
        return findings, [{"decision": "no prior findings supplied; all findings NEW"}]

    prior = _prior_index(prior_findings)
    matched_prior_keys = set()

    for f in findings:
        match = prior.get(f["merge_key"])
        if match is None:
            f["prior_review_recurrence"] = "NEW"
            continue
        matched_prior_keys.add(f["merge_key"])
        prior_state = (match.get("state") or "OPEN").upper()
        if match.get("evergreen_accepted"):
            f["prior_review_recurrence"] = "EVERGREEN_ACCEPTED"
            f["evergreen_accepted"] = True
            f["evergreen_acceptance_reason"] = match.get("evergreen_acceptance_reason")
            f["evergreen_acceptance_date"] = match.get("evergreen_acceptance_date")
            log.append({"merge_key": f["merge_key"], "decision": "EVERGREEN_ACCEPTED",
                        "rationale": "prior acceptance carried forward; escalation skipped"})
        elif prior_state in ("OPEN", "ACCEPTED"):
            before = f["severity"]
            f["prior_review_recurrence"] = "RECURRING"
            f["severity"] = ESCALATE[before]
            log.append({"merge_key": f["merge_key"], "decision": "RECURRING",
                        "severity_before": before, "severity_after": f["severity"],
                        "rationale": f"prior state {prior_state}; flagged before and not fixed"})
        elif prior_state == "RESOLVED":
            before = f["severity"]
            f["prior_review_recurrence"] = "REGRESSED"
            f["severity"] = ESCALATE[before]
            f["controller_escalation"] = True
            log.append({"merge_key": f["merge_key"], "decision": "REGRESSED",
                        "severity_before": before, "severity_after": f["severity"],
                        "rationale": "previously resolved and recurred; controller escalation trigger"})
        else:  # prior DISCARDED: treated as new signal, no escalation
            f["prior_review_recurrence"] = "NEW"
            log.append({"merge_key": f["merge_key"], "decision": "NEW",
                        "rationale": "prior finding was discarded; no escalation"})

    # Synthetic RESOLVED entries: priors that cleared in the current draft.
    synthetic = []
    notes_stmt = framework.statement_name("notes")
    for key, p in prior.items():
        if key in matched_prior_keys:
            continue
        prior_state = (p.get("state") or "OPEN").upper()
        if prior_state == "DISCARDED":
            continue
        synthetic.append({
            "id": "F-000", "source": "comparative", "legacy_layer": "L10",
            "category": "comparative_movement", "severity": "LOW",
            "confidence_label": "CERTAIN", "confidence_calibrated": 0.99,
            "statement": p.get("statement") or notes_stmt,
            "section": p.get("section") or "Prior review",
            "sort_order": 95,
            "location": {"statement": p.get("statement") or notes_stmt,
                         "line_id": None, "note_id": None, "path": None},
            "message": f"Prior-review finding cleared in this draft (merge key {key}). Recorded for the resolved-view audit trail.",
            "fix": "No action required.",
            "evidence": {"relationship": None, "lhs": None, "rhs": None, "delta": None,
                         "citation_key": None, "citation_verified": None,
                         "citation_source": None, "quoted_text": None},
            "materiality": {"amount": None, "basis": None, "basis_amount": None,
                            "ratio": None, "clearly_trivial": True},
            "suppressed": True, "skeptic": None,
            "merge_key": key, "framework": framework.code, "reconciler": None,
            "versions": (findings[0]["versions"] if findings else
                         {"engine": "", "schema": "", "adapter": "", "model_pin": ""}),
            "state": "RESOLVED", "prior_review_recurrence": "NEW",
            "synthetic_resolved": True,
        })
        log.append({"merge_key": key, "decision": "SYNTHETIC_RESOLVED",
                    "rationale": "prior finding absent from current draft"})
    return findings + synthetic, log
