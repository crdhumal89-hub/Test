"""
ApolloCAM Business Logic Engine — Python/pandas equivalents of Excel formulas.

Every function here mirrors an Excel formula chain exactly so that results
are identical between the Excel Phase 1 tool and this Phase 2 app.
Unit tests in tests/test_engine.py validate against the June 2026 seed data.
"""

from __future__ import annotations
import sqlite3
from datetime import date, timedelta
from typing import Optional
import json

import pandas as pd

# ─────────────────────────────────────────────────────────────────────────────
# STATUS ENGINE — mirrors DASHBOARD!H formula
# ─────────────────────────────────────────────────────────────────────────────

# Four-colour status constants
RED   = "RED"
AMBER = "AMBER"
GREEN = "GREEN"
BLUE  = "BLUE"

AMBER_BUFFER_DEFAULT = 1.10


def compute_status(cash: float, floor: float, ceiling: float,
                   amber_buffer: float = AMBER_BUFFER_DEFAULT) -> str:
    """
    Mirror: =IF(cash<floor,"RED", IF(cash<floor*AMBER_BUFFER,"AMBER",
               IF(cash<=ceiling,"GREEN","BLUE")))
    Matches Excel evaluation order exactly.
    """
    # Fail safe: an unknown (NaN) balance must surface as RED, never silently
    # fall through to BLUE. All comparisons below are False for NaN.
    if pd.isna(cash):
        return RED
    if cash < floor:
        return RED
    if cash < floor * amber_buffer:
        return AMBER
    if cash <= ceiling:
        return GREEN
    return BLUE


def compute_functional_usd(local_balance: float, ccy: str,
                           rate_map: dict[str, float]) -> float:
    """
    Mirror: _DATA!G = IFERROR(E * INDEX(SETTINGS!$C$45:$C$47,
                              MATCH($D{r}, SETTINGS!$A$45:$A$47, 0)), E)
    If CCY has no rate, return local balance as-is (treats it as USD).
    """
    return local_balance * rate_map.get(ccy, 1.0)


def load_rate_map(conn: sqlite3.Connection) -> dict[str, float]:
    """Load the most recent FX rate per base currency from the rates table."""
    df = pd.read_sql(
        """SELECT base, rate FROM fx_rates
           WHERE (base, rate_date) IN (
               SELECT base, MAX(rate_date) FROM fx_rates GROUP BY base
           )""",
        conn
    )
    rate_map = dict(zip(df["base"], df["rate"]))
    rate_map.setdefault("USD", 1.0)
    return rate_map


def build_fund_view(conn: sqlite3.Connection, run_date: str,
                    amber_buffer: float = AMBER_BUFFER_DEFAULT) -> pd.DataFrame:
    """
    Aggregate multi-account positions to one row per fund.
    Returns DataFrame with: fund_code, fund_name, ccy, cash_usd, cash_floor,
    cash_ceiling, status, surplus, deficit, pct_of_floor, routing_source, ssi_*
    """
    rate_map = load_rate_map(conn)

    # Load positions for this date
    df_pos = pd.read_sql(
        "SELECT fund_code, ccy, local_balance FROM positions WHERE run_date = ?",
        conn, params=[run_date]
    )
    df_funds = pd.read_sql(
        """SELECT fund_code, fund_name, entity_type, ccy AS fund_ccy,
                  cash_floor, cash_ceiling, routing_source,
                  ssi_account, ssi_bank, ssi_bic, ssi_entity
           FROM funds WHERE active = 1""",
        conn
    )

    if df_pos.empty:
        # Return fund view with zero cash (no positions loaded yet)
        df_funds["cash_usd"] = 0.0
        df_funds["status"] = df_funds.apply(
            lambda r: compute_status(0.0, r["cash_floor"], r["cash_ceiling"], amber_buffer),
            axis=1
        )
        df_funds["surplus"] = -df_funds["cash_floor"]
        df_funds["deficit"] = df_funds["cash_floor"]
        df_funds["pct_of_floor"] = 0.0
        return df_funds

    # Compute functional USD per position row
    df_pos["functional_usd"] = df_pos.apply(
        lambda r: compute_functional_usd(r["local_balance"], r["ccy"], rate_map), axis=1
    )

    # Sum to fund level
    df_cash = (
        df_pos.groupby("fund_code")["functional_usd"]
        .sum()
        .reset_index()
        .rename(columns={"functional_usd": "cash_usd"})
    )

    df = df_funds.merge(df_cash, on="fund_code", how="left")
    df["cash_usd"] = df["cash_usd"].fillna(0.0)

    df["status"] = df.apply(
        lambda r: compute_status(r["cash_usd"], r["cash_floor"], r["cash_ceiling"], amber_buffer),
        axis=1
    )
    df["surplus"] = df["cash_usd"] - df["cash_floor"]
    df["deficit"] = df["surplus"].clip(upper=0).abs()
    df["pct_of_floor"] = df.apply(
        lambda r: (r["cash_usd"] / r["cash_floor"] * 100) if r["cash_floor"] > 0 else 0.0,
        axis=1
    )

    return df


# ─────────────────────────────────────────────────────────────────────────────
# PROPOSAL ENGINE — mirrors PROPOSALS sheet wire + FX logic
# ─────────────────────────────────────────────────────────────────────────────

def propose_wires(df_fund_view: pd.DataFrame) -> list[dict]:
    """
    Mirror: PROPOSALS wire section.
    Priority order: largest deficit first (mirrors LARGE/urgency column in Excel).
    Wire amount = MIN(deficit, source_available_above_floor).
    Updates working balances sequentially (matching Excel's formula chain).

    Returns list of proposal dicts ready to INSERT into proposals table.
    """
    proposals = []
    # Mutable copy of balances — proposals reduce the source as they stack
    working_balances: dict[str, float] = dict(
        zip(df_fund_view["fund_code"], df_fund_view["cash_usd"])
    )

    red_funds = df_fund_view[df_fund_view["status"] == RED].copy()
    red_funds = red_funds.sort_values("deficit", ascending=False)

    for _, row in red_funds.iterrows():
        fund_code = row["fund_code"]
        deficit   = row["deficit"]
        src_code  = row["routing_source"]

        if not src_code or pd.isna(src_code):
            continue

        src_rows = df_fund_view[df_fund_view["fund_code"] == src_code]
        if src_rows.empty:
            continue

        src_floor   = src_rows.iloc[0]["cash_floor"]
        src_balance = working_balances.get(src_code, 0.0)
        src_available = max(0.0, src_balance - src_floor)
        wire_amt = round(min(deficit, src_available), 2)

        if wire_amt <= 0:
            continue

        # Update working balances for the next iteration
        working_balances[src_code] -= wire_amt
        working_balances[fund_code] = working_balances.get(fund_code, 0.0) + wire_amt

        proposals.append({
            "proposal_type": "WIRE",
            "from_fund":     src_code,
            "to_fund":       fund_code,
            "sell_ccy":      "USD",
            "sell_amount":   wire_amt,
            "buy_ccy":       "USD",
            "buy_amount":    wire_amt,
            "fx_rate":       1.0,
            "value_date":    None,
            "priority":      len(proposals) + 1,
        })

    return proposals


def propose_fx_conversions(conn: sqlite3.Connection,
                           df_fund_view: pd.DataFrame,
                           run_date: str) -> list[dict]:
    """
    Mirror: PROPOSALS spot FX section.
    Sell (local_balance - min_hold_local) of each excess non-USD holding.
    Value_date = WORKDAY(run_date, SPOT_VALUE_LAG_DAYS).
    """
    rate_map = load_rate_map(conn)

    spot_lag = int(_get_setting(conn, "SPOT_VALUE_LAG_DAYS", "2"))
    holiday_dates = _load_holidays(conn)
    value_date_str = _workday(date.fromisoformat(run_date), spot_lag, holiday_dates)

    df_thresh = pd.read_sql(
        "SELECT * FROM fx_thresholds WHERE auto_propose = 1", conn
    )
    # Guard against duplicate (fund, currency) threshold rows selling the same
    # balance twice — keep one rule per fund+currency.
    df_thresh = df_thresh.drop_duplicates(subset=["fund_code", "currency"], keep="first")
    df_positions = pd.read_sql(
        "SELECT fund_code, ccy, local_balance FROM positions WHERE run_date = ?",
        conn, params=[run_date]
    )

    proposals = []
    for _, thresh in df_thresh.iterrows():
        fund_code = thresh["fund_code"]
        currency  = thresh["currency"]
        min_hold  = thresh["min_hold_local"]

        local_bal = df_positions[
            (df_positions["fund_code"] == fund_code) &
            (df_positions["ccy"] == currency)
        ]["local_balance"].sum()

        sell_amt = round(local_bal - min_hold, 2)
        if sell_amt <= 0:
            continue

        rate = rate_map.get(currency, 1.0)
        proposals.append({
            "proposal_type":  "FX",
            "from_fund":      fund_code,
            "to_fund":        fund_code,
            "sell_ccy":       currency,
            "sell_amount":    sell_amt,
            "buy_ccy":        "USD",
            "buy_amount":     round(sell_amt * rate, 2),
            "fx_rate":        rate,
            "value_date":     str(value_date_str),
            "priority":       len(proposals) + 1,
            "_fx_counterparty": thresh.get("fx_counterparty", ""),
            "_settlement_acct": thresh.get("settlement_acct", ""),
        })

    return proposals


def save_proposals(conn: sqlite3.Connection, proposals: list[dict],
                   run_date: str, batch_id: str) -> None:
    """Insert proposal list into the proposals table and create wire_status rows.
    All inserts are wrapped in a single transaction — any failure rolls back entirely."""
    with conn:
        for p in proposals:
            cur = conn.execute(
                """INSERT INTO proposals
                   (batch_id, run_date, proposal_type, from_fund, to_fund, sell_ccy,
                    sell_amount, buy_ccy, buy_amount, fx_rate, value_date, priority, action)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'PENDING')""",
                (batch_id, run_date, p["proposal_type"], p["from_fund"], p["to_fund"],
                 p["sell_ccy"], p["sell_amount"], p["buy_ccy"], p.get("buy_amount"),
                 p.get("fx_rate"), p.get("value_date"), p.get("priority"))
            )
            proposal_id = cur.lastrowid

            # Create wire_status tracking row for WIRE proposals only
            if p["proposal_type"] == "WIRE":
                conn.execute(
                    """INSERT INTO wire_status(proposal_id, batch_id, status)
                       VALUES (?, ?, 'PROPOSED')""",
                    (proposal_id, batch_id)
                )


# ─────────────────────────────────────────────────────────────────────────────
# 14-DAY FORECAST ENGINE
# ─────────────────────────────────────────────────────────────────────────────

def build_14day_forecast(conn: sqlite3.Connection, df_fund_view: pd.DataFrame,
                         run_date: str,
                         amber_buffer: float = AMBER_BUFFER_DEFAULT,
                         horizon: int = 14) -> pd.DataFrame:
    """
    Walk each fund forward day by day, applying pipeline calls and distros.
    Returns DataFrame with columns: fund_code, target_date, projected_cash,
    projected_status, days_to_red (None if not heading RED).
    """
    today = date.fromisoformat(run_date)
    cutoff = today + timedelta(days=horizon)
    cutoff_str = str(cutoff)

    df_pipe = pd.read_sql(
        """SELECT fund_code, event_date, call_amount, distro_amount, ccy
           FROM pipeline_events
           WHERE event_date > ? AND event_date <= ?""",
        conn, params=[run_date, cutoff_str]
    )
    # Convert all pipeline amounts to functional USD so EUR/GBP calls affect projections.
    if not df_pipe.empty:
        fx = load_rate_map(conn)
        df_pipe["call_amount"]   = df_pipe.apply(
            lambda r: compute_functional_usd(r["call_amount"],   r["ccy"], fx), axis=1
        )
        df_pipe["distro_amount"] = df_pipe.apply(
            lambda r: compute_functional_usd(r["distro_amount"], r["ccy"], fx), axis=1
        )

    rows = []
    fund_map = df_fund_view.set_index("fund_code")

    for fund_code, fund_row in fund_map.iterrows():
        floor   = fund_row["cash_floor"]
        ceiling = fund_row["cash_ceiling"]
        balance = fund_row["cash_usd"]

        fund_pipe = df_pipe[df_pipe["fund_code"] == fund_code]

        for d in range(1, horizon + 1):
            target = today + timedelta(days=d)
            target_str = str(target)

            day_events = fund_pipe[fund_pipe["event_date"] == target_str]
            balance -= day_events["call_amount"].sum()
            balance += day_events["distro_amount"].sum()

            rows.append({
                "fund_code":        fund_code,
                "target_date":      target_str,
                "projected_cash":   round(balance, 2),
                "projected_status": compute_status(balance, floor, ceiling, amber_buffer),
            })

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    # Compute days_to_red per fund: find the first RED date in the horizon.
    # Avoid groupby.apply — pandas 3.0 drops the groupby key column from the output.
    red_rows = df[df["projected_status"] == RED]
    if not red_rows.empty:
        first_red = (
            red_rows.groupby("fund_code")["target_date"]
            .first()
            .map(lambda d: (pd.to_datetime(d) - pd.Timestamp(today)).days)
        )
        df["days_to_red"] = df["fund_code"].map(first_red)
    else:
        df["days_to_red"] = None

    return df


# ─────────────────────────────────────────────────────────────────────────────
# PRIVATE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _get_setting(conn: sqlite3.Connection, key: str, default: str = "") -> str:
    row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    return row[0] if row else default


def _load_holidays(conn: sqlite3.Connection) -> set[date]:
    rows = conn.execute("SELECT holiday_date FROM holidays").fetchall()
    result = set()
    for r in rows:
        try:
            result.add(date.fromisoformat(r[0]))
        except (ValueError, TypeError):
            pass
    return result


def _workday(start: date, lag: int, holidays: set[date]) -> date:
    """Advance `start` by `lag` business days, skipping weekends and holidays."""
    if lag <= 0:  # T+0 value date, or guard against a misconfigured negative lag
        return start
    current = start
    steps = 0
    while steps < lag:
        current += timedelta(days=1)
        if current.weekday() < 5 and current not in holidays:
            steps += 1
    return current


def get_amber_buffer(conn: sqlite3.Connection) -> float:
    val = _get_setting(conn, "AMBER_BUFFER", str(AMBER_BUFFER_DEFAULT))
    try:
        return float(val)
    except (ValueError, TypeError):
        return AMBER_BUFFER_DEFAULT


def latest_run_date(conn: sqlite3.Connection) -> Optional[str]:
    row = conn.execute("SELECT MAX(run_date) FROM positions").fetchone()
    return row[0] if row and row[0] else None


def status_summary(df: pd.DataFrame) -> dict:
    """Return counts for each status colour."""
    counts = df["status"].value_counts()
    return {
        RED:   int(counts.get(RED,   0)),
        AMBER: int(counts.get(AMBER, 0)),
        GREEN: int(counts.get(GREEN, 0)),
        BLUE:  int(counts.get(BLUE,  0)),
    }
