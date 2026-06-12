"""Deterministic core engine: arithmetic breaks to v9 findings.

Severity follows the v8 materiality rule carried into v9:
  |delta| >= planning materiality        CRITICAL
  |delta| >= clearly-trivial threshold   HIGH
  below the trivial threshold            LOW
All core findings are CERTAIN by construction. Ratio and per-unit breaks are
HIGH by default because a misstated highlight misleads regardless of dollars.
"""
from __future__ import annotations

from decimal import Decimal

from core.checks import run_all, Break
from core.numbers import D, f

ENGINE_VERSION = "9.1.0"
SCHEMA_VERSION = "9.0"

RATIO_RELATIONSHIPS = {"FH_NAV_PER_UNIT", "FH_EXPENSE_RATIO", "FH_NII_RATIO"}

CATEGORY_BY_RELATIONSHIP_PREFIX = [
    ("TIE_OUT", "tie_out_break"),
    ("BS_BALANCE", "balance_break"),
    ("SOC_CLOSURE", "rollforward_break"),
    ("SOC_CLASS_CLOSURE", "rollforward_break"),
    ("SOC_CLASS_FOOT", "rollforward_break"),
    ("FH_NAV", "per_unit_break"),
    ("FH_", "ratio_break"),
    ("SOI_TO_BS", "tie_out_break"),
    ("SOC_TO_BS", "tie_out_break"),
    ("SOC_ALLOC_TO_SOO", "tie_out_break"),
    ("SCF_TO_BS", "tie_out_break"),
    ("", "footing_break"),
]

SECTION_SORT = {
    "balance_sheet": 10, "soo": 20, "soc": 30, "scf": 40, "soi": 50,
    "highlights": 70, "tie_out": 90,
}


def _category(relationship: str) -> str:
    for prefix, category in CATEGORY_BY_RELATIONSHIP_PREFIX:
        if relationship.startswith(prefix):
            return category
    return "footing_break"


def _severity(brk: Break, materiality: Decimal, trivial: Decimal) -> str:
    if brk.relationship in RATIO_RELATIONSHIPS:
        return "HIGH"
    delta = abs(brk.delta)
    if materiality is not None and delta >= materiality:
        return "CRITICAL"
    if trivial is not None and delta >= trivial:
        return "HIGH"
    return "LOW"


def run_core(figures: dict, config: dict, framework, versions: dict) -> tuple[list[dict], dict]:
    """Run every arithmetic check. Returns (findings, coverage).

    `framework` supplies display names for canonical statement keys so the
    finding text matches the fund's reporting framework. `versions` is the
    ledger-stamped version block applied to every finding.
    """
    tolerances = config["tolerances"]
    result = run_all(figures, tolerances)

    capital = D(figures.get("balance_sheet", {}).get("partners_capital"))
    planning_pct = D(figures.get("metadata_materiality_pct")
                     or config["materiality"]["default_planning_pct_of_nav"])
    materiality = (capital * planning_pct) if capital is not None else None
    trivial = (materiality * D(config["materiality"]["clearly_trivial_pct_of_materiality"])) \
        if materiality is not None else None

    findings = []
    for idx, brk in enumerate(result.breaks):
        statement = framework.statement_name(brk.statement_key)
        severity = _severity(brk, materiality, trivial)
        amount = abs(brk.delta)
        is_ratio = brk.relationship in RATIO_RELATIONSHIPS
        clearly_trivial = bool(not is_ratio and trivial is not None and amount < trivial)
        findings.append({
            "id": "F-000",  # assigned after deterministic global sort
            "source": "core",
            "legacy_layer": "L2",
            "category": _category(brk.relationship),
            "severity": severity,
            "confidence_label": "CERTAIN",
            "confidence_calibrated": 0.99,
            "statement": statement,
            "section": brk.section,
            "sort_order": SECTION_SORT.get(brk.statement_key, 99) + idx,
            "location": {"statement": statement, "line_id": brk.line_id, "note_id": None, "path": brk.path},
            "message": brk.message,
            "fix": brk.fix,
            "evidence": {
                "relationship": brk.relationship,
                "lhs": f(brk.lhs), "rhs": f(brk.rhs), "delta": f(brk.delta),
                "citation_key": None, "citation_verified": None,
                "citation_source": None, "quoted_text": None,
            },
            "materiality": {
                "amount": None if is_ratio else f(amount),
                "basis": "partners_capital",
                "basis_amount": f(capital) if capital is not None else None,
                "ratio": f(amount / capital) if (capital not in (None, Decimal(0)) and not is_ratio) else None,
                "clearly_trivial": clearly_trivial,
            },
            "suppressed": False,
            "skeptic": None,
            "merge_key": f"{statement}::{brk.section}::{brk.line_id}::{_category(brk.relationship)}",
            "framework": framework.code,
            "reconciler": None,
            "versions": versions,
            "state": "OPEN",
        })
    coverage = {"checked": result.checked, "skipped": result.skipped}
    return findings, coverage
