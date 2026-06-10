"""
Position file importer — handles CSV and Excel inputs from JPM or any source
with variable column ordering.  Same dynamic header-mapping approach as the VBA
GetColMap function in modApolloCAM.bas.
"""

from __future__ import annotations
import sqlite3
import hashlib
import io
from pathlib import Path
from typing import Union

import pandas as pd

from .engine import compute_functional_usd, load_rate_map, _get_setting
from .database import log_audit

# Required and optional headers (case-insensitive match)
REQUIRED_HEADERS = {"fund_code", "ccy", "cash_balance_local", "report_date"}
OPTIONAL_HEADERS = {"account_name", "functional_balance", "bank"}

# Canonical header aliases — maps common JPM column names to our internal names
HEADER_ALIASES: dict[str, str] = {
    # fund code variants
    "fund_code": "fund_code",
    "fundcode": "fund_code",
    "fund": "fund_code",
    "fund id": "fund_code",
    # balance variants
    "cash_balance_local": "cash_balance_local",
    "cash balance local": "cash_balance_local",
    "balance": "cash_balance_local",
    "closing balance": "cash_balance_local",
    "ledger balance": "cash_balance_local",
    "cash balance": "cash_balance_local",
    # currency
    "ccy": "ccy",
    "currency": "ccy",
    "curr": "ccy",
    # date
    "report_date": "report_date",
    "report date": "report_date",
    "as of date": "report_date",
    "as_of_date": "report_date",
    "date": "report_date",
    # account
    "account_name": "account_name",
    "account name": "account_name",
    "account": "account_name",
    "acct name": "account_name",
}


class PositionImportError(Exception):
    pass


def parse_position_file(
    source: Union[str, Path, io.BytesIO],
    filename: str = "unknown",
) -> tuple[pd.DataFrame, list[str]]:
    """
    Parse a JPM position file (CSV or Excel) into a clean DataFrame.
    Returns (df, warnings) where df has canonical column names.
    Raises PositionImportError if required columns are missing.
    """
    warnings: list[str] = []

    # Read file
    if isinstance(source, (str, Path)):
        path = Path(source)
        ext = path.suffix.lower()
        if ext == ".csv":
            raw = pd.read_csv(path, dtype=str, keep_default_na=False)
        else:
            raw = pd.read_excel(path, dtype=str, keep_default_na=False)
    else:
        # BytesIO — detect by trying Excel first, fall back to CSV
        try:
            source.seek(0)
            raw = pd.read_excel(source, dtype=str, keep_default_na=False)
        except Exception:
            source.seek(0)
            raw = pd.read_csv(source, dtype=str, keep_default_na=False)

    if raw.empty:
        raise PositionImportError("File is empty or has no data rows.")

    # Normalise headers
    raw.columns = [str(c).strip().lower() for c in raw.columns]
    col_map = {c: HEADER_ALIASES.get(c, c) for c in raw.columns}
    raw.rename(columns=col_map, inplace=True)

    # Check required columns
    missing = REQUIRED_HEADERS - set(raw.columns)
    if missing:
        raise PositionImportError(
            f"Required columns not found: {', '.join(sorted(missing))}. "
            f"Available: {', '.join(sorted(raw.columns))}"
        )

    # Clean up values
    df = raw.copy()
    df["fund_code"] = df["fund_code"].str.strip().str.upper()
    df["ccy"] = df["ccy"].str.strip().str.upper()
    df = df[df["fund_code"].str.len() > 0]  # drop blank fund rows

    # Convert balance to float
    df["cash_balance_local"] = (
        df["cash_balance_local"]
        .str.replace(",", "", regex=False)
        .str.replace("(", "-", regex=False)
        .str.replace(")", "", regex=False)
        .str.replace("$", "", regex=False)
        .str.strip()
    )
    df["cash_balance_local"] = pd.to_numeric(df["cash_balance_local"], errors="coerce")

    bad_balance = df["cash_balance_local"].isna().sum()
    if bad_balance > 0:
        warnings.append(f"{bad_balance} rows had unparseable balance values and were excluded.")
        df = df[df["cash_balance_local"].notna()]

    # Parse report_date
    df["report_date"] = pd.to_datetime(df["report_date"], errors="coerce")
    bad_date = df["report_date"].isna().sum()
    if bad_date > 0:
        warnings.append(f"{bad_date} rows had unparseable report_date values.")

    # Fill optional columns
    if "account_name" not in df.columns:
        df["account_name"] = ""
    if "bank" not in df.columns:
        df["bank"] = "JPMORGAN CHASE NA"

    # Format report_date as ISO string
    df["report_date"] = df["report_date"].dt.strftime("%Y-%m-%d")

    return df[["fund_code", "account_name", "ccy", "cash_balance_local",
               "report_date", "bank"]], warnings


def validate_against_funds(df: pd.DataFrame, conn: sqlite3.Connection) -> tuple[pd.DataFrame, list[str]]:
    """
    Check that all fund_codes in the position file exist in the funds master.
    Returns (valid_df, unknown_codes_list).
    """
    known = {r[0] for r in conn.execute("SELECT fund_code FROM funds WHERE active = 1")}
    unknown = df[~df["fund_code"].isin(known)]["fund_code"].unique().tolist()
    valid_df = df[df["fund_code"].isin(known)].copy()
    return valid_df, unknown


def commit_positions(
    df: pd.DataFrame,
    conn: sqlite3.Connection,
    run_date: str,
    source_file: str = "",
) -> int:
    """
    Write validated positions to the database.
    Computes functional_usd via FX rates table.
    Returns number of rows inserted.
    """
    rate_map = load_rate_map(conn)

    df = df.copy()  # avoid mutating the caller's DataFrame
    df["functional_usd"] = df.apply(
        lambda r: compute_functional_usd(r["cash_balance_local"], r["ccy"], rate_map),
        axis=1
    )

    # Atomic: delete existing + insert new in a single transaction so a crash
    # mid-loop cannot leave the table in a partially-replaced state.
    with conn:
        conn.execute("DELETE FROM positions WHERE run_date = ?", (run_date,))
        for _, row in df.iterrows():
            conn.execute(
                """INSERT INTO positions
                   (run_date, fund_code, account_name, ccy, local_balance, functional_usd, source_file)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (run_date, row["fund_code"], row.get("account_name", ""),
                 row["ccy"], row["cash_balance_local"], row["functional_usd"], source_file)
            )

    rows_inserted = len(df)
    log_audit(conn, "IMPORT_POSITIONS", "positions", run_date,
              f"File: {source_file} | Rows: {rows_inserted} | Date: {run_date}")
    return rows_inserted
