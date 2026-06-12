"""Canonical clean-review fixture factory.

One source of truth for a fully consistent figure set, reused by the core unit
suite and by the golden-library generator. The numbers are constructed so that
every arithmetic relationship holds exactly; any single mutation breaks exactly
the relationships that depend on the mutated figure.
"""
from __future__ import annotations

import copy


def make_clean_figures() -> dict:
    """A fully consistent ASC-946-style figure set. All relationships hold."""
    figures = {
        "entity": {
            "fund_code": "GLD-FUND-A",
            "legal_name": "Golden Fund A LP",
            "period": "FY2025",
            "period_end": "2025-12-31",
            "currency": "USD",
            "units_outstanding": 1000000,
        },
        "balance_sheet": {
            "assets": {
                "investments_at_fair_value": 100000000.0,
                "cash": 5000000.0,
                "receivables": 2000000.0,
                "other_assets": 1000000.0,
                "total_assets": 108000000.0,
            },
            "liabilities": {
                "payables": 3000000.0,
                "due_to_affiliates": 1000000.0,
                "other_liabilities": 1000000.0,
                "total_liabilities": 5000000.0,
            },
            "partners_capital": 103000000.0,
        },
        "schedule_of_investments": {
            "positions": [
                {"name": "Alpha Holdco", "industry": "Industrials", "type": "equity", "fair_value": 40000000.0, "cost": 30000000.0, "level": 3},
                {"name": "Beta Credit", "industry": "Financials", "type": "debt", "fair_value": 20000000.0, "cost": 20000000.0, "level": 3},
                {"name": "Gamma Listed", "industry": "Technology", "type": "equity", "fair_value": 10000000.0, "cost": 8000000.0, "level": 1},
                {"name": "Delta Notes", "industry": "Healthcare", "type": "debt", "fair_value": 20000000.0, "cost": 15000000.0, "level": 2},
                {"name": "Epsilon Loan", "industry": "Energy", "type": "debt", "fair_value": 10000000.0, "cost": 7000000.0, "level": 2},
            ],
            "total_fair_value": 100000000.0,
            "total_cost": 80000000.0,
            "level_totals": {"1": 10000000.0, "2": 30000000.0, "3": 60000000.0},
        },
        "statement_of_operations": {
            "investment_income": {"interest": 8000000.0, "dividends": 2000000.0, "total": 10000000.0},
            "expenses": {"management_fee": 2000000.0, "professional_fees": 1000000.0, "other": 500000.0, "total": 3500000.0},
            "net_investment_income": 6500000.0,
            "net_realized_gain": 4000000.0,
            "net_change_unrealized": 6000000.0,
            "net_increase_in_partners_capital": 16500000.0,
        },
        "statement_of_changes": {
            "beginning_capital": 90000000.0,
            "contributions": 10000000.0,
            "distributions": -13500000.0,
            "allocation_net_increase": 16500000.0,
            "ending_capital": 103000000.0,
            "by_class": [
                {"class_id": "A", "beginning": 60000000.0, "contributions": 6000000.0,
                 "distributions": -9000000.0, "allocation": 11000000.0, "ending": 68000000.0},
                {"class_id": "B", "beginning": 30000000.0, "contributions": 4000000.0,
                 "distributions": -4500000.0, "allocation": 5500000.0, "ending": 35000000.0},
            ],
        },
        "cash_flows": {
            "present": True,
            "beginning_cash": 4000000.0,
            "net_change_in_cash": 1000000.0,
            "ending_cash": 5000000.0,
        },
        "financial_highlights": {
            "nav_per_unit": 103.0,
            "average_capital": 96500000.0,
            # 3500000 / 96500000 and 6500000 / 96500000, stated to 6 decimals
            # (inside the 5 bps tolerance).
            "expense_ratio": 0.036269,
            "nii_ratio": 0.067358,
        },
        "tie_out": {
            "balance_sheet.assets.total_assets": 108000000.0,
            "balance_sheet.assets.investments_at_fair_value": 100000000.0,
            "balance_sheet.liabilities.total_liabilities": 5000000.0,
            "balance_sheet.partners_capital": 103000000.0,
            "schedule_of_investments.total_fair_value": 100000000.0,
            "statement_of_operations.net_increase_in_partners_capital": 16500000.0,
            "statement_of_changes.ending_capital": 103000000.0,
        },
    }
    return figures


def mutate(figures: dict, path: str, value) -> dict:
    """Return a deep copy with the figure at the dotted path replaced."""
    out = copy.deepcopy(figures)
    parts = path.split(".")
    cur = out
    for part in parts[:-1]:
        cur = cur[part]
    cur[parts[-1]] = value
    return out
