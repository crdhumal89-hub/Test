"""Materiality-aware suppression. Steward-controlled via config.

Clearly-trivial LOW findings are suppressed from the default view but retained
in the trail (findings.json keeps them with suppressed=true; the audit-file
export includes them with a marker; the preparer export excludes them).
"""
from __future__ import annotations

SEVERITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]


def apply_suppression(findings: list[dict], config: dict) -> tuple[list[dict], int]:
    cfg = config.get("suppression", {})
    if not cfg.get("suppress_clearly_trivial", True):
        return findings, 0
    max_sev = cfg.get("max_severity_suppressible", "LOW")
    max_rank = SEVERITY_ORDER.index(max_sev)
    suppressed = 0
    for f in findings:
        if f["materiality"].get("clearly_trivial") and \
                SEVERITY_ORDER.index(f["severity"]) <= max_rank:
            f["suppressed"] = True
            suppressed += 1
    return findings, suppressed
