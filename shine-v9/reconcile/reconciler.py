"""Specificity-scored reconciler, carried forward from the v8 algorithm.

All patterns are evaluated against the finding population; candidates with all
triggers met are scored trigger_count x severity_weight x scope_weight and the
highest score wins. A constituent is consumed by at most one root cause and is
preserved, in full, inside the root cause's reconciler.constituents. Every
decision, including losing candidates and their scores, lands in the log.
"""
from __future__ import annotations

SEVERITY_WEIGHT = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
SEVERITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]


def _match_level3_cluster(findings):
    core_levels = [f for f in findings
                   if f["source"] == "core" and f.get("evidence", {}).get("relationship") == "SOI_LEVELS_FOOT"]
    std_rollforward = [f for f in findings
                       if f["source"] == "standards" and "LEVEL3_ROLLFORWARD" in (f.get("check_id") or "")]
    if core_levels and std_rollforward:
        return [core_levels[0], std_rollforward[0]]
    return None


def _match_org_note_twin(findings):
    reg = [f for f in findings if f["source"] == "regulatory" and f["section"] == "Organization"]
    disc = [f for f in findings if f["source"] in ("disclosure", "standards")
            and f["section"] == "Organization"]
    if reg and disc:
        return [reg[0], disc[0]]
    return None


def _match_entity_cascade(findings):
    entity = [f for f in findings if f["category"] == "entity_mismatch"]
    if len(entity) >= 2:
        return entity
    return None


PATTERNS = [
    {"name": "P01 Level 3 infrastructure cluster", "match": _match_level3_cluster,
     "severity_floor": "CRITICAL", "single_statement": False,
     "root_category": "standards_gap", "root_section": "Fair value measurements",
     "root_message": "The Level 3 infrastructure is inconsistent end to end: the leveling table does not foot to the schedule total and the Level 3 reconciliation disclosure is deficient. Treat as one root cause: rebuild the Level 3 population, re-foot the leveling table, and complete the reconciliation note.",
     "root_fix": "Rebuild the Level 3 population from the valuation workbook, re-foot the leveling table to the schedule total, and complete the reconciliation roll-forward and unobservable-inputs disclosures from the same population."},
    {"name": "P02 Organization note twin", "match": _match_org_note_twin,
     "severity_floor": "MEDIUM", "single_statement": True,
     "root_category": "regulatory_gap", "root_section": "Organization",
     "root_message": "The organization note is deficient on both regulatory and disclosure dimensions. Treat as one root cause: rewrite the organization note to the framework and jurisdiction inventory.",
     "root_fix": "Rewrite the organization note covering entity formation, regulatory registrations, and the audit distribution statement in one pass."},
    {"name": "P03 Entity identity cascade", "match": _match_entity_cascade,
     "severity_floor": "CRITICAL", "single_statement": True,
     "root_category": "entity_mismatch", "root_section": "Entity identity",
     "root_message": "Multiple entity-identity attributes disagree with fund metadata. Treat as one root cause: the statements were likely prepared from the wrong template or the metadata is stale.",
     "root_fix": "Establish the source of truth for entity identity, then correct the cover and headers in one pass."},
]


def _score(pattern, constituents):
    trigger_count = len(constituents)
    severity_weight = SEVERITY_WEIGHT[pattern["severity_floor"]]
    scope_weight = 2.0 if pattern["single_statement"] else 1.0
    return trigger_count * severity_weight * scope_weight


def run_reconciler(findings: list[dict], framework) -> tuple[list[dict], list[dict]]:
    """Returns (findings_after_collapse, decision_log)."""
    log: list[dict] = []
    consumed_ids = set()
    candidates = []
    for pattern in PATTERNS:
        matched = pattern["match"](findings)
        if matched:
            candidates.append((pattern, matched, _score(pattern, matched)))
            log.append({"pattern": pattern["name"], "triggers_met": len(matched),
                        "score": _score(pattern, matched), "candidate": True})
        else:
            log.append({"pattern": pattern["name"], "triggers_met": 0,
                        "score": 0, "candidate": False})

    candidates.sort(key=lambda c: (-c[2], c[0]["name"]))
    roots = []
    for pattern, matched, score in candidates:
        usable = [f for f in matched if id(f) not in consumed_ids]
        if len(usable) < 2:
            log.append({"pattern": pattern["name"], "outcome": "skipped",
                        "reason": "constituents already consumed by a higher-scoring pattern"})
            continue
        for f in usable:
            consumed_ids.add(id(f))
        top_severity = max((f["severity"] for f in usable),
                           key=lambda s: SEVERITY_ORDER.index(s))
        base = max(usable, key=lambda f: SEVERITY_ORDER.index(f["severity"]))
        root = dict(base)
        root.update({
            "category": pattern["root_category"],
            "severity": top_severity,
            "section": pattern["root_section"],
            "message": pattern["root_message"],
            "fix": pattern["root_fix"],
            "merge_key": f"{base['statement']}::{pattern['root_section']}::root::{pattern['root_category']}",
            "reconciler": {"pattern": pattern["name"], "score": score,
                           "constituents": [dict(f) for f in usable]},
        })
        roots.append(root)
        log.append({"pattern": pattern["name"], "outcome": "collapsed",
                    "score": score, "constituent_count": len(usable),
                    "constituent_messages": [f["message"][:80] for f in usable]})

    surviving = [f for f in findings if id(f) not in consumed_ids]
    return surviving + roots, log
