"""Arithmetic relationship checks. Pure functions, Decimal-exact, no model.

Each check receives the figures dict and a tolerances dict and returns a list
of Break records. A Break carries the exact relationship id, both sides of the
equality, and the delta, so the finding that reaches the controller names the
numbers, not a vague concern.

Canonical statement keys used here (display names are applied later by the
framework engine): balance_sheet, soi, soo, soc, scf, highlights, tie_out.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from core.numbers import D, get_path


@dataclass
class Break:
    relationship: str
    statement_key: str
    section: str
    line_id: str
    path: str
    lhs: Decimal
    rhs: Decimal
    message: str
    fix: str

    @property
    def delta(self) -> Decimal:
        return self.lhs - self.rhs


@dataclass
class CheckResult:
    breaks: list = field(default_factory=list)
    checked: list = field(default_factory=list)
    skipped: list = field(default_factory=list)

    def check(self, relationship: str):
        self.checked.append(relationship)

    def skip(self, relationship: str, reason_code: str, reason: str):
        self.skipped.append({"relationship": relationship, "reason_code": reason_code, "reason": reason})

    def merge(self, other: "CheckResult"):
        self.breaks.extend(other.breaks)
        self.checked.extend(other.checked)
        self.skipped.extend(other.skipped)


def _eq(result: CheckResult, relationship: str, lhs, rhs, tol: Decimal, *,
        statement_key: str, section: str, line_id: str, path: str,
        message: str, fix: str) -> None:
    """Register the check; emit a Break when |lhs - rhs| exceeds tolerance."""
    result.check(relationship)
    if abs(lhs - rhs) > tol:
        result.breaks.append(Break(
            relationship=relationship, statement_key=statement_key, section=section,
            line_id=line_id, path=path, lhs=lhs, rhs=rhs,
            message=message.format(lhs=lhs, rhs=rhs, delta=lhs - rhs),
            fix=fix,
        ))


def check_balance_sheet(figures: dict, tol: dict) -> CheckResult:
    r = CheckResult()
    bs = figures.get("balance_sheet")
    if not bs:
        r.skip("BS_ASSETS_FOOT", "INPUT_MISSING", "balance_sheet absent from figures")
        r.skip("BS_LIABS_FOOT", "INPUT_MISSING", "balance_sheet absent from figures")
        r.skip("BS_BALANCE", "INPUT_MISSING", "balance_sheet absent from figures")
        return r
    total_tol = D(tol["total_abs"])

    assets = bs.get("assets", {})
    asset_lines = {k: D(v) for k, v in assets.items() if k != "total_assets"}
    total_assets = D(assets.get("total_assets"))
    if asset_lines and total_assets is not None:
        _eq(r, "BS_ASSETS_FOOT", sum(asset_lines.values()), total_assets, total_tol,
            statement_key="balance_sheet", section="Assets", line_id="Total assets",
            path="balance_sheet.assets.total_assets",
            message="Asset lines foot to {lhs} but Total assets is stated as {rhs}: break of {delta}.",
            fix="Re-foot the asset section and correct the stated total or the component line that is misstated.")
    else:
        r.skip("BS_ASSETS_FOOT", "INPUT_MISSING", "asset lines or total absent")

    liabs = bs.get("liabilities", {})
    liab_lines = {k: D(v) for k, v in liabs.items() if k != "total_liabilities"}
    total_liabs = D(liabs.get("total_liabilities"))
    if liab_lines and total_liabs is not None:
        _eq(r, "BS_LIABS_FOOT", sum(liab_lines.values()), total_liabs, total_tol,
            statement_key="balance_sheet", section="Liabilities", line_id="Total liabilities",
            path="balance_sheet.liabilities.total_liabilities",
            message="Liability lines foot to {lhs} but Total liabilities is stated as {rhs}: break of {delta}.",
            fix="Re-foot the liability section and correct the stated total or the component line that is misstated.")
    else:
        r.skip("BS_LIABS_FOOT", "INPUT_MISSING", "liability lines or total absent")

    capital = D(bs.get("partners_capital"))
    if total_assets is not None and total_liabs is not None and capital is not None:
        _eq(r, "BS_BALANCE", total_assets, total_liabs + capital, total_tol,
            statement_key="balance_sheet", section="Partners capital", line_id="Partners capital",
            path="balance_sheet.partners_capital",
            message="Total assets {lhs} do not equal liabilities plus partners capital {rhs}: imbalance of {delta}.",
            fix="The statement does not balance. Trace the imbalance to the misstated side before any other review step.")
    else:
        r.skip("BS_BALANCE", "INPUT_MISSING", "totals or capital absent")
    return r


def check_soi(figures: dict, tol: dict) -> CheckResult:
    r = CheckResult()
    soi = figures.get("schedule_of_investments")
    bs = figures.get("balance_sheet", {})
    if not soi:
        for rel in ("SOI_POSITIONS_FOOT_FV", "SOI_POSITIONS_FOOT_COST", "SOI_LEVELS_FOOT", "SOI_TO_BS"):
            r.skip(rel, "INPUT_MISSING", "schedule_of_investments absent from figures")
        return r
    total_tol = D(tol["total_abs"])
    positions = soi.get("positions", [])
    total_fv = D(soi.get("total_fair_value"))
    total_cost = D(soi.get("total_cost"))

    if positions and total_fv is not None:
        _eq(r, "SOI_POSITIONS_FOOT_FV", sum(D(p["fair_value"]) for p in positions), total_fv, total_tol,
            statement_key="soi", section="Investments", line_id="Total investments at fair value",
            path="schedule_of_investments.total_fair_value",
            message="Position fair values foot to {lhs} but the schedule total is stated as {rhs}: break of {delta}.",
            fix="Re-foot the schedule and correct the stated total or the position that is misstated.")
    else:
        r.skip("SOI_POSITIONS_FOOT_FV", "INPUT_MISSING", "positions or total fair value absent")

    if positions and total_cost is not None:
        _eq(r, "SOI_POSITIONS_FOOT_COST", sum(D(p["cost"]) for p in positions), total_cost, total_tol,
            statement_key="soi", section="Investments", line_id="Total investments at cost",
            path="schedule_of_investments.total_cost",
            message="Position costs foot to {lhs} but the schedule cost total is stated as {rhs}: break of {delta}.",
            fix="Re-foot the cost column and correct the stated total or the position that is misstated.")
    else:
        r.skip("SOI_POSITIONS_FOOT_COST", "SUBPOPULATION_ABSENT", "cost column absent")

    levels = soi.get("level_totals")
    if levels and total_fv is not None:
        _eq(r, "SOI_LEVELS_FOOT", sum(D(v) for v in levels.values()), total_fv, total_tol,
            statement_key="soi", section="Fair value hierarchy", line_id="Level totals",
            path="schedule_of_investments.level_totals",
            message="Level 1 plus Level 2 plus Level 3 foots to {lhs} but total fair value is {rhs}: break of {delta}.",
            fix="Reconcile the leveling table to the schedule total. A position is missing from, or double-counted in, a level.")
    else:
        r.skip("SOI_LEVELS_FOOT", "SUBPOPULATION_ABSENT", "level totals absent")

    bs_inv = D(get_path(figures, "balance_sheet.assets.investments_at_fair_value"))
    if total_fv is not None and bs_inv is not None:
        _eq(r, "SOI_TO_BS", total_fv, bs_inv, total_tol,
            statement_key="soi", section="Investments", line_id="Total investments at fair value",
            path="schedule_of_investments.total_fair_value",
            message="Schedule of investments total {lhs} does not tie to the balance sheet investments line {rhs}: break of {delta}.",
            fix="Tie the schedule to the statement of assets and liabilities. One of the two is misstated.")
    elif total_fv is not None:
        r.skip("SOI_TO_BS", "INPUT_MISSING", "balance sheet investments line absent")
    return r


def check_soo(figures: dict, tol: dict) -> CheckResult:
    r = CheckResult()
    soo = figures.get("statement_of_operations")
    if not soo:
        for rel in ("SOO_INCOME_FOOT", "SOO_EXPENSES_FOOT", "SOO_NII", "SOO_NET_INCREASE"):
            r.skip(rel, "INPUT_MISSING", "statement_of_operations absent from figures")
        return r
    total_tol = D(tol["total_abs"])

    income = soo.get("investment_income", {})
    income_lines = {k: D(v) for k, v in income.items() if k != "total"}
    income_total = D(income.get("total"))
    if income_lines and income_total is not None:
        _eq(r, "SOO_INCOME_FOOT", sum(income_lines.values()), income_total, total_tol,
            statement_key="soo", section="Investment income", line_id="Total investment income",
            path="statement_of_operations.investment_income.total",
            message="Income lines foot to {lhs} but total investment income is stated as {rhs}: break of {delta}.",
            fix="Re-foot investment income and correct the stated total or the component line.")
    else:
        r.skip("SOO_INCOME_FOOT", "INPUT_MISSING", "income lines or total absent")

    expenses = soo.get("expenses", {})
    expense_lines = {k: D(v) for k, v in expenses.items() if k != "total"}
    expense_total = D(expenses.get("total"))
    if expense_lines and expense_total is not None:
        _eq(r, "SOO_EXPENSES_FOOT", sum(expense_lines.values()), expense_total, total_tol,
            statement_key="soo", section="Expenses", line_id="Total expenses",
            path="statement_of_operations.expenses.total",
            message="Expense lines foot to {lhs} but total expenses is stated as {rhs}: break of {delta}.",
            fix="Re-foot expenses and correct the stated total or the component line.")
    else:
        r.skip("SOO_EXPENSES_FOOT", "INPUT_MISSING", "expense lines or total absent")

    nii = D(soo.get("net_investment_income"))
    if income_total is not None and expense_total is not None and nii is not None:
        _eq(r, "SOO_NII", income_total - expense_total, nii, total_tol,
            statement_key="soo", section="Net investment income", line_id="Net investment income",
            path="statement_of_operations.net_investment_income",
            message="Income minus expenses computes to {lhs} but net investment income is stated as {rhs}: break of {delta}.",
            fix="Recompute net investment income from the stated income and expense totals.")
    else:
        r.skip("SOO_NII", "INPUT_MISSING", "totals or NII absent")

    realized = D(soo.get("net_realized_gain"))
    unrealized = D(soo.get("net_change_unrealized"))
    net_increase = D(soo.get("net_increase_in_partners_capital"))
    if None not in (nii, realized, unrealized, net_increase):
        _eq(r, "SOO_NET_INCREASE", nii + realized + unrealized, net_increase, total_tol,
            statement_key="soo", section="Net increase in partners capital", line_id="Net increase in partners capital from operations",
            path="statement_of_operations.net_increase_in_partners_capital",
            message="NII plus realized plus unrealized computes to {lhs} but the stated net increase is {rhs}: break of {delta}.",
            fix="Recompute the net increase line from its three stated components.")
    else:
        r.skip("SOO_NET_INCREASE", "INPUT_MISSING", "one or more components absent")
    return r


def check_soc(figures: dict, tol: dict) -> CheckResult:
    r = CheckResult()
    soc = figures.get("statement_of_changes")
    if not soc:
        for rel in ("SOC_CLOSURE", "SOC_ALLOC_TO_SOO", "SOC_TO_BS", "SOC_CLASS_CLOSURE", "SOC_CLASS_FOOT"):
            r.skip(rel, "INPUT_MISSING", "statement_of_changes absent from figures")
        return r
    total_tol = D(tol["total_abs"])

    beginning = D(soc.get("beginning_capital"))
    contributions = D(soc.get("contributions"))
    distributions = D(soc.get("distributions"))
    allocation = D(soc.get("allocation_net_increase"))
    ending = D(soc.get("ending_capital"))

    if None not in (beginning, contributions, distributions, allocation, ending):
        _eq(r, "SOC_CLOSURE", beginning + contributions + distributions + allocation, ending, total_tol,
            statement_key="soc", section="Roll-forward", line_id="Ending partners capital",
            path="statement_of_changes.ending_capital",
            message="Beginning plus contributions plus distributions plus allocation computes to {lhs} but ending capital is stated as {rhs}: break of {delta}.",
            fix="Close the roll-forward. One movement line or the ending balance is misstated.")
    else:
        r.skip("SOC_CLOSURE", "INPUT_MISSING", "roll-forward components absent")

    soo_net = D(get_path(figures, "statement_of_operations.net_increase_in_partners_capital"))
    if allocation is not None and soo_net is not None:
        _eq(r, "SOC_ALLOC_TO_SOO", allocation, soo_net, total_tol,
            statement_key="soc", section="Roll-forward", line_id="Allocation of net increase",
            path="statement_of_changes.allocation_net_increase",
            message="The allocation in the statement of changes {lhs} does not tie to the statement of operations net increase {rhs}: break of {delta}.",
            fix="Tie the allocation line to the statement of operations.")
    elif allocation is not None:
        r.skip("SOC_ALLOC_TO_SOO", "INPUT_MISSING", "statement of operations net increase absent")

    bs_capital = D(get_path(figures, "balance_sheet.partners_capital"))
    if ending is not None and bs_capital is not None:
        _eq(r, "SOC_TO_BS", ending, bs_capital, total_tol,
            statement_key="soc", section="Roll-forward", line_id="Ending partners capital",
            path="statement_of_changes.ending_capital",
            message="Ending capital in the statement of changes {lhs} does not tie to the balance sheet partners capital {rhs}: break of {delta}.",
            fix="Tie the statement of changes ending balance to the balance sheet.")
    elif ending is not None:
        r.skip("SOC_TO_BS", "INPUT_MISSING", "balance sheet partners capital absent")

    by_class = soc.get("by_class")
    if by_class:
        class_ending_sum = Decimal(0)
        closure_checked = False
        for cls in by_class:
            cb, cc = D(cls.get("beginning")), D(cls.get("contributions"))
            cd, ca = D(cls.get("distributions")), D(cls.get("allocation"))
            ce = D(cls.get("ending"))
            if None in (cb, cc, cd, ca, ce):
                continue
            closure_checked = True
            class_ending_sum += ce
            _eq(r, "SOC_CLASS_CLOSURE", cb + cc + cd + ca, ce, total_tol,
                statement_key="soc", section="Roll-forward by class",
                line_id=f"Class {cls.get('class_id', '?')} ending capital",
                path="statement_of_changes.by_class",
                message="Class roll-forward computes to {lhs} but the class ending balance is stated as {rhs}: break of {delta}.",
                fix="Close the class roll-forward. A class movement line or the class ending balance is misstated.")
        if closure_checked and ending is not None:
            _eq(r, "SOC_CLASS_FOOT", class_ending_sum, ending, total_tol,
                statement_key="soc", section="Roll-forward by class", line_id="Total ending capital",
                path="statement_of_changes.ending_capital",
                message="Class ending balances foot to {lhs} but total ending capital is {rhs}: break of {delta}.",
                fix="Foot the class endings to the statement total.")
    else:
        r.skip("SOC_CLASS_CLOSURE", "SUBPOPULATION_ABSENT", "no class breakdown presented")
        r.skip("SOC_CLASS_FOOT", "SUBPOPULATION_ABSENT", "no class breakdown presented")
    return r


def check_scf(figures: dict, tol: dict) -> CheckResult:
    r = CheckResult()
    scf = figures.get("cash_flows")
    if not scf or not scf.get("present", False):
        r.skip("SCF_CLOSURE", "SUBPOPULATION_ABSENT", "statement of cash flows not presented (election out)")
        r.skip("SCF_TO_BS", "SUBPOPULATION_ABSENT", "statement of cash flows not presented (election out)")
        return r
    total_tol = D(tol["total_abs"])
    beginning = D(scf.get("beginning_cash"))
    net_change = D(scf.get("net_change_in_cash"))
    ending = D(scf.get("ending_cash"))
    if None not in (beginning, net_change, ending):
        _eq(r, "SCF_CLOSURE", beginning + net_change, ending, total_tol,
            statement_key="scf", section="Cash reconciliation", line_id="Ending cash",
            path="cash_flows.ending_cash",
            message="Beginning cash plus net change computes to {lhs} but ending cash is stated as {rhs}: break of {delta}.",
            fix="Close the cash reconciliation.")
    else:
        r.skip("SCF_CLOSURE", "INPUT_MISSING", "cash reconciliation components absent")
    bs_cash = D(get_path(figures, "balance_sheet.assets.cash"))
    if ending is not None and bs_cash is not None:
        _eq(r, "SCF_TO_BS", ending, bs_cash, total_tol,
            statement_key="scf", section="Cash reconciliation", line_id="Ending cash",
            path="cash_flows.ending_cash",
            message="Ending cash per the cash flow statement {lhs} does not tie to the balance sheet cash line {rhs}: break of {delta}.",
            fix="Tie ending cash to the balance sheet.")
    elif ending is not None:
        r.skip("SCF_TO_BS", "INPUT_MISSING", "balance sheet cash line absent")
    return r


def check_highlights(figures: dict, tol: dict) -> CheckResult:
    r = CheckResult()
    fh = figures.get("financial_highlights")
    if not fh:
        for rel in ("FH_NAV_PER_UNIT", "FH_EXPENSE_RATIO", "FH_NII_RATIO"):
            r.skip(rel, "INPUT_MISSING", "financial_highlights absent from figures")
        return r
    per_unit_tol = D(tol["per_unit_abs"])
    ratio_tol = D(tol["ratio_bps"]) / Decimal(10000)

    capital = D(get_path(figures, "balance_sheet.partners_capital"))
    units = D(get_path(figures, "entity.units_outstanding"))
    nav_per_unit = D(fh.get("nav_per_unit"))
    if None not in (capital, units, nav_per_unit) and units != 0:
        _eq(r, "FH_NAV_PER_UNIT", capital / units, nav_per_unit, per_unit_tol,
            statement_key="highlights", section="Per-unit data", line_id="NAV per unit",
            path="financial_highlights.nav_per_unit",
            message="Partners capital divided by units computes to {lhs} but NAV per unit is stated as {rhs}: break of {delta}.",
            fix="Recompute NAV per unit from ending capital and units outstanding.")
    else:
        r.skip("FH_NAV_PER_UNIT", "INPUT_MISSING", "capital, units, or stated NAV per unit absent")

    avg_capital = D(fh.get("average_capital"))
    expense_total = D(get_path(figures, "statement_of_operations.expenses.total"))
    expense_ratio = D(fh.get("expense_ratio"))
    if None not in (avg_capital, expense_total, expense_ratio) and avg_capital != 0:
        _eq(r, "FH_EXPENSE_RATIO", expense_total / avg_capital, expense_ratio, ratio_tol,
            statement_key="highlights", section="Ratios", line_id="Expense ratio",
            path="financial_highlights.expense_ratio",
            message="Total expenses over average capital computes to {lhs} but the expense ratio is stated as {rhs}: break of {delta}.",
            fix="Recompute the expense ratio from stated expenses and the disclosed average capital.")
    else:
        r.skip("FH_EXPENSE_RATIO", "INPUT_MISSING", "expense ratio inputs absent")

    nii = D(get_path(figures, "statement_of_operations.net_investment_income"))
    nii_ratio = D(fh.get("nii_ratio"))
    if None not in (avg_capital, nii, nii_ratio) and avg_capital != 0:
        _eq(r, "FH_NII_RATIO", nii / avg_capital, nii_ratio, ratio_tol,
            statement_key="highlights", section="Ratios", line_id="Net investment income ratio",
            path="financial_highlights.nii_ratio",
            message="Net investment income over average capital computes to {lhs} but the NII ratio is stated as {rhs}: break of {delta}.",
            fix="Recompute the NII ratio from the statement of operations and the disclosed average capital.")
    else:
        r.skip("FH_NII_RATIO", "INPUT_MISSING", "NII ratio inputs absent")
    return r


def check_tie_out(figures: dict, tol: dict) -> CheckResult:
    """Compare every figure in the tie-out workbook map against the statements.

    Per the v8 materiality framework carried into v9: individual lines within
    line_abs tolerance, totals exact. The tie-out map declares which paths are
    totals via the path naming convention (contains 'total' or is a statement
    closing balance).
    """
    r = CheckResult()
    tie_out = figures.get("tie_out")
    if not tie_out:
        r.skip("TIE_OUT", "INPUT_MISSING", "tie-out workbook values absent from inputs")
        return r
    line_tol = D(tol["line_abs"])
    total_tol = D(tol["total_abs"])
    total_markers = ("total", "ending_capital", "partners_capital", "net_increase")

    for path, wb_value in sorted(tie_out.items()):
        fs_value = D(get_path(figures, path))
        if fs_value is None:
            r.skip(f"TIE_OUT:{path}", "INPUT_MISSING", f"figure path {path} absent from statements")
            continue
        is_total = any(m in path for m in total_markers)
        _eq(r, f"TIE_OUT:{path}", fs_value, D(wb_value), total_tol if is_total else line_tol,
            statement_key="tie_out", section="Tie-out workbook", line_id=path.rsplit(".", 1)[-1],
            path=path,
            message="The statement carries {lhs} but the tie-out workbook carries {rhs}: break of {delta}.",
            fix="Reconcile the statement figure to the tie-out workbook. One of the two sources is stale or misstated.")
    return r


ALL_CHECKS = [check_balance_sheet, check_soi, check_soo, check_soc, check_scf, check_highlights, check_tie_out]


def run_all(figures: dict, tolerances: dict) -> CheckResult:
    result = CheckResult()
    for check in ALL_CHECKS:
        result.merge(check(figures, tolerances))
    return result
