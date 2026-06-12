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


def make_metadata(framework: str = "ASC946", *, domicile: str = "Cayman Islands",
                  jurisdictions=None, linked_entities=None) -> dict:
    """Fund metadata in the v8-compatible shape, framework-selecting for v9."""
    if jurisdictions is None:
        jurisdictions = {"Cayman Islands": ["CIMA"], "Luxembourg": ["CSSF"],
                         "Delaware": []}.get(domicile, [])
    return {
        "fund_code": "GLD-FUND-A",
        "legal_name": "Golden Fund A LP",
        "domicile": domicile,
        "structure_type": "Closed-end credit LP",
        "fiscal_year_end": "12-31",
        "formed_after_2020": True,
        "adviser_sec_registered": True,
        "regulatory_jurisdictions": jurisdictions,
        "presentation": {"framework": framework, "currency": "USD"},
        "materiality": {"planning_pct_of_nav": 0.0075},
        "linked_entities": linked_entities or [],
    }


def make_manifest(review_id: str = "GLD-FUND-A-FY2025-D1") -> dict:
    return {
        "review_id": review_id,
        "period": "FY2025",
        "draft": "Draft 1",
        "inputs": {
            "figures": "figures.json",
            "notes": "notes.json",
            "metadata": "_FUND-METADATA.json",
        },
    }


def make_clean_notes(framework: str = "ASC946", domicile: str = "Cayman Islands") -> dict:
    """A note set that satisfies the full disclosure inventory for the chosen
    framework, so a clean review emits zero judgment findings."""
    org_reg = {
        "Cayman Islands": "The Fund is registered with the Cayman Islands Monetary Authority under the Private Funds Act (registration number 12345).",
        "Luxembourg": "The Fund is a societe a responsabilite limitee subject to supervision by the Commission de Surveillance du Secteur Financier and files annual accounts with the RCS.",
        "Delaware": "The Fund is a Delaware limited partnership formed under the Delaware Revised Uniform Limited Partnership Act.",
    }[domicile]
    hierarchy_title = {
        "ASC946": "Fair value measurements",
        "IFRS": "Fair value measurement",
        "USGAAP": "Fair value measurements",
    }[framework]
    notes = [
        {"id": "1", "title": "Organization",
         "text": f"Golden Fund A LP (the Fund) is a closed-end investment vehicle. {org_reg} "
                 "The Fund distributes annual audited financial statements to all investors."},
        {"id": "2", "title": "Significant accounting policies",
         "text": "The financial statements are prepared on a fair value basis. "
                 "Investments are measured at fair value with changes recognized in operations. "
                 "The Fund qualifies as an investment entity and accounts for its investments at fair value."},
        {"id": "3", "title": hierarchy_title,
         "text": "The Fund categorizes fair value measurements into a three-level hierarchy: Level 1 quoted prices, "
                 "Level 2 observable inputs, Level 3 unobservable inputs. "
                 "The Level 3 reconciliation presents the opening balance, purchases, sales, settlements, "
                 "transfers in and out, realized and unrealized gains and losses, and the closing balance. "
                 "Significant unobservable inputs include market multiples and discount rates, with ranges and weighted averages disclosed."},
        {"id": "4", "title": "Investments and concentration",
         "text": "Alpha Holdco represents 38.8 percent of partners capital and Beta Credit represents 19.4 percent. "
                 "Each investment exceeding 5 percent of net assets is separately identified in the schedule of investments."},
        {"id": "5", "title": "Related party transactions",
         "text": "The Fund pays a management fee to the Investment Manager, an affiliate of the General Partner. "
                 "Amounts due to affiliates at period end are presented on the statement of assets and liabilities."},
        {"id": "6", "title": "Subsequent events",
         "text": "The Fund has evaluated subsequent events through March 15, 2026, the date the financial statements were available to be issued. No recognizable or disclosable events were identified."},
        {"id": "7", "title": "Recently issued accounting standards",
         "text": "The Fund adopted ASU 2022-03 effective January 1, 2024. Management has evaluated ASU 2023-09 and ASU 2024-03 and does not expect a material effect."
                 if framework == "ASC946" else
                 "New and amended standards effective for the period have been applied. No standard issued but not yet effective is expected to have a material effect."},
    ]
    if framework == "IFRS":
        notes.append({"id": "8", "title": "Interests in other entities",
                      "text": "The Fund meets the definition of an investment entity under IFRS 10 and measures its "
                              "subsidiaries at fair value through profit or loss. Disclosures of interests in other "
                              "entities required by IFRS 12 are presented herein."})
        notes.append({"id": "9", "title": "Financial risk management",
                      "text": "The Fund's exposure to credit risk, liquidity risk, and market risk arising from "
                              "financial instruments, and the related sensitivity analysis, is disclosed as required by IFRS 7."})
    return {"notes": notes}


def make_clean_review(framework: str = "ASC946", *, domicile: str | None = None,
                      review_id: str = "GLD-FUND-A-FY2025-D1") -> dict:
    """Full clean review bundle: figures, notes, metadata, manifest."""
    if domicile is None:
        domicile = {"ASC946": "Cayman Islands", "IFRS": "Luxembourg", "USGAAP": "Delaware"}[framework]
    return {
        "figures": make_clean_figures(),
        "notes": make_clean_notes(framework, domicile),
        "metadata": make_metadata(framework, domicile=domicile),
        "manifest": make_manifest(review_id),
    }


def write_review_folder(folder, bundle: dict) -> None:
    """Materialize a review bundle as an on-disk review folder."""
    import json
    from pathlib import Path
    inputs = Path(folder) / "inputs"
    inputs.mkdir(parents=True, exist_ok=True)
    (inputs / "figures.json").write_text(json.dumps(bundle["figures"], sort_keys=True, indent=1), encoding="utf-8")
    (inputs / "notes.json").write_text(json.dumps(bundle["notes"], sort_keys=True, indent=1), encoding="utf-8")
    (inputs / "_FUND-METADATA.json").write_text(json.dumps(bundle["metadata"], sort_keys=True, indent=1), encoding="utf-8")
    (inputs / "_REVIEW-MANIFEST.json").write_text(json.dumps(bundle["manifest"], sort_keys=True, indent=1), encoding="utf-8")
    for optional in ("prior_figures", "sibling_figures", "prior_findings"):
        if bundle.get(optional):
            (inputs / f"{optional}.json").write_text(
                json.dumps(bundle[optional], sort_keys=True, indent=1), encoding="utf-8")
