"""Framework engine interface and shared applicability flags.

A framework engine owns WHAT must be true for a fund reporting under it:
statement names and required statements, and a checklist of disclosure and
standards items with citation keys and applicability rules computed from the
figures. The judges own HOW each item is checked against the notes.

No engine ever defaults: frameworks/registry.py selects from fund metadata and
halts on absence. Assuming ASC was a v8 limitation that v9 removes.
"""
from __future__ import annotations

from decimal import Decimal

from core.numbers import D


class FrameworkError(Exception):
    """Raised when framework selection fails. Never silently defaulted."""


def derive_flags(figures: dict) -> dict:
    """Deterministic applicability flags computed from the figures."""
    soi = figures.get("schedule_of_investments", {}) or {}
    positions = soi.get("positions", []) or []
    levels = soi.get("level_totals", {}) or {}
    capital = D(figures.get("balance_sheet", {}).get("partners_capital")) or Decimal(0)
    due_affiliates = D(figures.get("balance_sheet", {}).get("liabilities", {}).get("due_to_affiliates")) or Decimal(0)

    aggregated_over_5pct = []
    if capital > 0:
        for p in positions:
            name = (p.get("name") or "").lower()
            if ("other" in name or "aggregated" in name or "various" in name) \
                    and D(p.get("fair_value", 0)) / capital > Decimal("0.05"):
                aggregated_over_5pct.append(p.get("name"))

    return {
        "has_investments": bool(positions) or D(soi.get("total_fair_value", 0)) != 0,
        "has_level3": D(levels.get("3", 0)) > 0,
        "has_derivatives": any(p.get("type") == "derivative" for p in positions),
        "has_fund_positions": any(p.get("type") == "fund" for p in positions),
        "has_due_to_affiliates": due_affiliates > 0,
        "aggregated_positions_over_5pct": aggregated_over_5pct,
        "scf_presented": bool(figures.get("cash_flows", {}).get("present", False)),
    }


class FrameworkEngine:
    """Base interface. Subclasses define code, statement names, requirements
    and the checklist."""

    code = "BASE"
    statement_names: dict = {}
    fs_page_order: list = []

    def statement_name(self, canonical_key: str) -> str:
        return self.statement_names.get(canonical_key, canonical_key)

    def required_statements(self, figures: dict) -> list[dict]:
        """[{canonical_key, required, citation_key, reason}]"""
        raise NotImplementedError

    def checklist(self, figures: dict, metadata: dict) -> list[dict]:
        """Disclosure and standards checklist items.

        Item shape:
          check_id, kind (disclosure|standards), applicable, applicability_reason,
          citation_key (mandatory for kind=standards), note_title_patterns,
          require_text_patterns (list of regex strings, ALL must match the
          chosen note), severity, section, message_missing, fix.
        """
        raise NotImplementedError


def item(check_id: str, kind: str, applicable: bool, reason: str, *,
         citation_key: str | None, note_title_patterns: list[str],
         require_text_patterns: list[str], severity: str, section: str,
         message_missing: str, fix: str) -> dict:
    if kind == "standards" and not citation_key:
        raise ValueError(f"standards checklist item {check_id} must carry a citation key")
    return {
        "check_id": check_id, "kind": kind, "applicable": applicable,
        "applicability_reason": reason, "citation_key": citation_key,
        "note_title_patterns": note_title_patterns,
        "require_text_patterns": require_text_patterns,
        "severity": severity, "section": section,
        "message_missing": message_missing, "fix": fix,
    }
