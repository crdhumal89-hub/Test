"""Decimal-exact numeric helpers for the deterministic core.

Every figure that enters an arithmetic relationship is converted to Decimal
via its string representation, so float artifacts can never produce or mask
a break. No language model participates in anything in this package.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any


def D(x: Any) -> Decimal:
    """Convert a JSON number to an exact Decimal. None stays None."""
    if x is None:
        return None
    if isinstance(x, Decimal):
        return x
    return Decimal(str(x))


def get_path(obj: dict, dotted: str):
    """Resolve a dotted path like 'balance_sheet.assets.total_assets'.

    Returns None when any segment is missing rather than raising, so callers
    can record a coverage skip instead of crashing.
    """
    cur = obj
    for part in dotted.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def f(x: Decimal) -> float:
    """Decimal to float for JSON serialization of evidence numbers."""
    return float(x) if x is not None else None
